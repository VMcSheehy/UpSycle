import { describe, expect, it } from "vitest";

import {
  fulfillPaidCart,
  stockDecrementWhere,
  type CheckoutStore,
  type PendingCheckoutPatch,
  type PendingCheckoutState,
} from "@/lib/checkout-fulfillment";
import type { StoredCartLine } from "@/lib/stored-cart";

function line(overrides: Partial<StoredCartLine> = {}): StoredCartLine {
  return {
    productId: "p1",
    quantity: 1,
    unitPriceCents: 1000,
    shippingCostCents: 200,
    sellerProfileId: "seller-1",
    title: "Bowl",
    fulfillmentMethod: "SHIP",
    ...overrides,
  };
}

function harness(inventory: Record<string, number>) {
  const stock = { ...inventory };
  const orders: { id: string; stripePaymentId: string; lines: StoredCartLine[]; total: number }[] = [];
  const refunds: number[] = [];
  let seq = 0;
  const pending: PendingCheckoutState & {
    buyerId: string;
    shippingAddressId: string | null;
    totalAmountCents: number;
    lines: StoredCartLine[] | null;
  } = {
    status: "OPEN",
    stripePaymentId: null,
    refundDueCents: 0,
    refundedAmountCents: 0,
    buyerId: "buyer-1",
    shippingAddressId: "addr-1",
    totalAmountCents: 0,
    lines: null,
  };

  function apply(patch: PendingCheckoutPatch) {
    if (patch.status) pending.status = patch.status;
    if (patch.stripePaymentId) pending.stripePaymentId = patch.stripePaymentId;
    if (patch.refundDueCents !== undefined) pending.refundDueCents = patch.refundDueCents;
    if (patch.refundedAmountCents !== undefined) pending.refundedAmountCents = patch.refundedAmountCents;
  }

  const store: CheckoutStore = {
    async findOrderByStripePaymentId(id) {
      const found = orders.find((order) => order.stripePaymentId === id);
      return found ? { id: found.id } : null;
    },
    async withPaymentLock(_id, fn) {
      return fn({
        async findOrderByStripePaymentId(id) {
          const found = orders.find((order) => order.stripePaymentId === id);
          return found ? { id: found.id } : null;
        },
        async decrementIfAvailable(productId, quantity) {
          const have = stock[productId] ?? 0;
          if (have < quantity) return false;
          stock[productId] = have - quantity;
          return true;
        },
        async createOrder(input) {
          const id = `order-${++seq}`;
          orders.push({
            id,
            stripePaymentId: input.stripePaymentId,
            lines: input.lines,
            total: input.totalAmountCents,
          });
          return { id };
        },
        savePending: async (patch) => apply(patch),
      });
    },
  };

  return {
    stock,
    orders,
    pending,
    refunds,
    store,
    refund: async (cents: number) => {
      refunds.push(cents);
    },
  };
}

describe("fulfillPaidCart", () => {
  it("does not record an order or refund when the payment is not paid", async () => {
    const cart = harness({ p1: 3 });
    const lines = [line()];
    cart.pending.totalAmountCents = 1200;
    cart.pending.lines = lines;

    const result = await fulfillPaidCart({
      paymentStatus: "unpaid",
      amountTotal: 1200,
      stripePaymentId: "pi_unpaid",
      pending: cart.pending,
      store: cart.store,
      refund: cart.refund,
      savePending: async (patch) => {
        if (patch.status) cart.pending.status = patch.status;
      },
    });

    expect(result.outcome).toBe("ignored_unpaid");
    expect(cart.orders).toHaveLength(0);
    expect(cart.refunds).toHaveLength(0);
    expect(cart.stock.p1).toBe(3);
  });

  it("refunds and does not record an order when the paid amount does not match", async () => {
    const cart = harness({ p1: 3 });
    cart.pending.totalAmountCents = 1200;
    cart.pending.lines = [line()];

    const result = await fulfillPaidCart({
      paymentStatus: "paid",
      amountTotal: 500,
      stripePaymentId: "pi_mismatch",
      pending: cart.pending,
      store: cart.store,
      refund: cart.refund,
      savePending: async (patch) => {
        if (patch.status) cart.pending.status = patch.status;
        if (patch.stripePaymentId) cart.pending.stripePaymentId = patch.stripePaymentId;
        if (patch.refundDueCents !== undefined) cart.pending.refundDueCents = patch.refundDueCents;
        if (patch.refundedAmountCents !== undefined) cart.pending.refundedAmountCents = patch.refundedAmountCents;
      },
    });

    expect(result).toMatchObject({ outcome: "refunded", reason: "amount", refundedCents: 500 });
    expect(cart.orders).toHaveLength(0);
    expect(cart.refunds).toEqual([500]);
    expect(cart.stock.p1).toBe(3);

    const again = await fulfillPaidCart({
      paymentStatus: "paid",
      amountTotal: 500,
      stripePaymentId: "pi_mismatch",
      pending: cart.pending,
      store: cart.store,
      refund: cart.refund,
      savePending: async () => {},
    });
    expect(again.outcome).toBe("duplicate");
    expect(cart.refunds).toEqual([500]);
  });

  it("decrements stock once and ignores a second delivery of the same payment", async () => {
    const cart = harness({ p1: 5 });
    const lines = [line({ quantity: 2, shippingCostCents: 200 })];
    cart.pending.totalAmountCents = 2200;
    cart.pending.lines = lines;

    const first = await fulfillPaidCart({
      paymentStatus: "paid",
      amountTotal: 2200,
      stripePaymentId: "pi_ok",
      pending: cart.pending,
      store: cart.store,
      refund: cart.refund,
      savePending: async (patch) => {
        if (patch.status) cart.pending.status = patch.status;
        if (patch.stripePaymentId) cart.pending.stripePaymentId = patch.stripePaymentId;
        if (patch.refundDueCents !== undefined) cart.pending.refundDueCents = patch.refundDueCents;
        if (patch.refundedAmountCents !== undefined) cart.pending.refundedAmountCents = patch.refundedAmountCents;
      },
    });

    expect(first).toMatchObject({ outcome: "fulfilled", refundedCents: 0 });
    expect(cart.stock.p1).toBe(3);
    expect(cart.orders).toHaveLength(1);
    expect(cart.orders[0].total).toBe(2200);
    expect(cart.orders[0].lines).toHaveLength(1);

    const second = await fulfillPaidCart({
      paymentStatus: "paid",
      amountTotal: 2200,
      stripePaymentId: "pi_ok",
      pending: cart.pending,
      store: cart.store,
      refund: cart.refund,
      savePending: async () => {},
    });

    expect(second.outcome).toBe("duplicate");
    expect(cart.stock.p1).toBe(3);
    expect(cart.orders).toHaveLength(1);
    expect(cart.refunds).toHaveLength(0);
  });

  it("refunds a line that is out of stock and does not put that line on the order", async () => {
    const cart = harness({ p1: 0, p2: 4 });
    const lines = [
      line({ productId: "p1", unitPriceCents: 1500, shippingCostCents: 500 }),
      line({ productId: "p2", unitPriceCents: 800, shippingCostCents: 0, title: "Mug" }),
    ];
    cart.pending.totalAmountCents = 2800;
    cart.pending.lines = lines;

    const result = await fulfillPaidCart({
      paymentStatus: "paid",
      amountTotal: 2800,
      stripePaymentId: "pi_partial",
      pending: cart.pending,
      store: cart.store,
      refund: cart.refund,
      savePending: async (patch) => {
        if (patch.status) cart.pending.status = patch.status;
        if (patch.stripePaymentId) cart.pending.stripePaymentId = patch.stripePaymentId;
        if (patch.refundDueCents !== undefined) cart.pending.refundDueCents = patch.refundDueCents;
        if (patch.refundedAmountCents !== undefined) cart.pending.refundedAmountCents = patch.refundedAmountCents;
      },
    });

    expect(result).toMatchObject({ outcome: "fulfilled", refundedCents: 2000 });
    expect(cart.stock.p1).toBe(0);
    expect(cart.stock.p2).toBe(3);
    expect(cart.orders[0].lines.map((item) => item.productId)).toEqual(["p2"]);
    expect(cart.orders[0].total).toBe(800);
    expect(cart.refunds).toEqual([2000]);
  });

  it("refunds the whole charge and creates no order when every line is gone", async () => {
    const cart = harness({ p1: 1 });
    const lines = [line({ quantity: 2 })];
    cart.pending.totalAmountCents = 2200;
    cart.pending.lines = lines;

    const result = await fulfillPaidCart({
      paymentStatus: "paid",
      amountTotal: 2200,
      stripePaymentId: "pi_gone",
      pending: cart.pending,
      store: cart.store,
      refund: cart.refund,
      savePending: async (patch) => {
        if (patch.status) cart.pending.status = patch.status;
        if (patch.stripePaymentId) cart.pending.stripePaymentId = patch.stripePaymentId;
        if (patch.refundDueCents !== undefined) cart.pending.refundDueCents = patch.refundDueCents;
        if (patch.refundedAmountCents !== undefined) cart.pending.refundedAmountCents = patch.refundedAmountCents;
      },
    });

    expect(result).toMatchObject({ outcome: "refunded", reason: "no_stock", refundedCents: 2200 });
    expect(cart.orders).toHaveLength(0);
    expect(cart.stock.p1).toBe(1);
    expect(cart.refunds).toEqual([2200]);
  });

  it("requires remaining stock and an approved seller before decrementing", () => {
    expect(stockDecrementWhere("product-1", 2)).toEqual({
      id: "product-1",
      inventoryCount: { gte: 2 },
      sellerProfile: { approvalStatus: "APPROVED" },
    });
  });
});
