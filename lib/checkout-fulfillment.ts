import { orderTotalCents, paymentIsPaidAndMatches, type StoredCartLine } from "@/lib/stored-cart";
import { publicSellerWhere } from "@/lib/public-catalog";

export interface PendingCheckoutState {
  status: "OPEN" | "FULFILLED" | "REFUNDED";
  stripePaymentId: string | null;
  refundDueCents: number;
  refundedAmountCents: number;
}

export interface PendingCheckoutPatch {
  status?: PendingCheckoutState["status"];
  stripePaymentId?: string;
  refundDueCents?: number;
  refundedAmountCents?: number;
}

export interface CreateOrderInput {
  buyerId: string;
  shippingAddressId: string | null;
  totalAmountCents: number;
  stripePaymentId: string;
  lines: StoredCartLine[];
}

export interface CheckoutTx {
  findOrderByStripePaymentId(stripePaymentId: string): Promise<{ id: string } | null>;
  // True only when the row still had enough stock and the seller was approved.
  // False means this line is left off the order and refunded.
  decrementIfAvailable(productId: string, quantity: number): Promise<boolean>;
  createOrder(input: CreateOrderInput): Promise<{ id: string }>;
  savePending(patch: PendingCheckoutPatch): Promise<void>;
}

export interface CheckoutStore {
  findOrderByStripePaymentId(stripePaymentId: string): Promise<{ id: string } | null>;
  withPaymentLock<T>(stripePaymentId: string, fn: (tx: CheckoutTx) => Promise<T>): Promise<T>;
}

export type CartFulfillmentResult =
  | { outcome: "ignored_unpaid" }
  | { outcome: "duplicate"; orderId: string | null }
  | { outcome: "refunded"; refundedCents: number; reason: "amount" | "no_stock" | "unreadable_cart" }
  | { outcome: "fulfilled"; orderId: string; refundedCents: number };

export interface CartFulfillmentInput {
  paymentStatus: string | null;
  amountTotal: number | null;
  stripePaymentId: string;
  pending: PendingCheckoutState & {
    buyerId: string;
    shippingAddressId: string | null;
    totalAmountCents: number;
    lines: StoredCartLine[] | null;
  };
  store: CheckoutStore;
  refund: (amountCents: number) => Promise<void>;
  savePending: (patch: PendingCheckoutPatch) => Promise<void>;
}

function outstandingRefund(pending: PendingCheckoutState): number {
  return Math.max(0, pending.refundDueCents - pending.refundedAmountCents);
}

async function finishRefund(
  pending: PendingCheckoutState,
  stripePaymentId: string,
  amountCents: number,
  reason: "amount" | "no_stock" | "unreadable_cart",
  refund: (amountCents: number) => Promise<void>,
  savePending: (patch: PendingCheckoutPatch) => Promise<void>,
): Promise<CartFulfillmentResult> {
  await savePending({
    stripePaymentId,
    refundDueCents: amountCents,
  });
  if (amountCents > 0) {
    await refund(amountCents);
  }
  await savePending({
    status: "REFUNDED",
    stripePaymentId,
    refundDueCents: amountCents,
    refundedAmountCents: pending.refundedAmountCents + amountCents,
  });
  return { outcome: "refunded", refundedCents: amountCents, reason };
}

// Records an order only when Stripe reports the session paid and the amount
// matches the total saved at checkout. Stock is taken inside the caller's
// transaction. Lines that cannot be filled are omitted and refunded. A second
// delivery of the same payment id does not decrement stock again.
export async function fulfillPaidCart(input: CartFulfillmentInput): Promise<CartFulfillmentResult> {
  const { pending, stripePaymentId } = input;
  const stillDue = outstandingRefund(pending);

  if (pending.stripePaymentId === stripePaymentId && stillDue > 0) {
    await input.refund(stillDue);
    const status = pending.status === "FULFILLED" ? "FULFILLED" : "REFUNDED";
    await input.savePending({
      refundedAmountCents: pending.refundedAmountCents + stillDue,
      status,
    });
    if (status === "FULFILLED") {
      const existing = await input.store.findOrderByStripePaymentId(stripePaymentId);
      return { outcome: "fulfilled", orderId: existing?.id ?? "", refundedCents: stillDue };
    }
    return { outcome: "refunded", refundedCents: stillDue, reason: "amount" };
  }

  if (pending.status === "REFUNDED" || pending.status === "FULFILLED") {
    const existing = pending.stripePaymentId
      ? await input.store.findOrderByStripePaymentId(pending.stripePaymentId)
      : null;
    return { outcome: "duplicate", orderId: existing?.id ?? null };
  }

  if (input.paymentStatus !== "paid") {
    return { outcome: "ignored_unpaid" };
  }

  if (!paymentIsPaidAndMatches(input.paymentStatus, input.amountTotal, pending.totalAmountCents)) {
    const refundCents = input.amountTotal && input.amountTotal > 0 ? input.amountTotal : 0;
    return finishRefund(pending, stripePaymentId, refundCents, "amount", input.refund, input.savePending);
  }

  if (!pending.lines) {
    const refundCents = input.amountTotal ?? pending.totalAmountCents;
    return finishRefund(
      pending,
      stripePaymentId,
      refundCents,
      "unreadable_cart",
      input.refund,
      input.savePending,
    );
  }

  const locked = await input.store.withPaymentLock(stripePaymentId, async (tx) => {
    const existing = await tx.findOrderByStripePaymentId(stripePaymentId);
    if (existing) {
      return { duplicate: existing, order: null as { id: string } | null, skipped: [] as StoredCartLine[] };
    }

    const fulfilled: StoredCartLine[] = [];
    const skipped: StoredCartLine[] = [];
    for (const line of pending.lines ?? []) {
      const taken = await tx.decrementIfAvailable(line.productId, line.quantity);
      if (taken) fulfilled.push(line);
      else skipped.push(line);
    }

    const refundDueCents = orderTotalCents(skipped);
    if (fulfilled.length === 0) {
      await tx.savePending({
        status: "REFUNDED",
        stripePaymentId,
        refundDueCents,
        refundedAmountCents: 0,
      });
      return { duplicate: null, order: null, skipped };
    }

    const order = await tx.createOrder({
      buyerId: pending.buyerId,
      shippingAddressId: pending.shippingAddressId,
      totalAmountCents: orderTotalCents(fulfilled),
      stripePaymentId,
      lines: fulfilled,
    });
    await tx.savePending({
      status: "FULFILLED",
      stripePaymentId,
      refundDueCents,
      refundedAmountCents: 0,
    });
    return { duplicate: null, order, skipped };
  });

  if (locked.duplicate) {
    return { outcome: "duplicate", orderId: locked.duplicate.id };
  }

  const refundedCents = orderTotalCents(locked.skipped);
  if (refundedCents > 0) {
    await input.refund(refundedCents);
    await input.savePending({ refundedAmountCents: refundedCents });
  }

  if (!locked.order) {
    return { outcome: "refunded", refundedCents, reason: "no_stock" };
  }

  return { outcome: "fulfilled", orderId: locked.order.id, refundedCents };
}

// Prisma filter for the production stock update. A line is taken only when
// enough units remain and the seller is still approved.
export function stockDecrementWhere(productId: string, quantity: number, now = new Date()) {
  return {
    id: productId,
    inventoryCount: { gte: quantity },
    sellerProfile: publicSellerWhere(now),
  };
}
