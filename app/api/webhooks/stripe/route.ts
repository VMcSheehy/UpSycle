// Stripe webhook endpoint — this is where an Order actually gets created.
//
// We deliberately do NOT create the Order at Checkout Session creation time
// (see app/api/checkout/route.ts): there's no "pending payment" order state
// in the schema (Order has no payment-status field, only a shipping-status
// aggregate), so the only correct moment to write Order/OrderItem rows is
// once Stripe confirms the charge actually succeeded. Until a webhook fires,
// an abandoned/failed Checkout Session simply never becomes an Order.
//
// Signature verification requires the exact raw request body (not the
// JSON-parsed body) — Next.js route handlers give you that via
// `request.text()` as long as you don't call `.json()` first.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import type { PlacementPageType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { fulfillPaidCart } from "@/lib/checkout-fulfillment";
import { createPrismaCheckoutStore } from "@/lib/prisma-checkout-store";
import { fulfillPlacementSlot } from "@/lib/placement-fulfillment";
import { PAID_SLOT_COUNT, placementSlotPriceCents } from "@/lib/placement";
import { parseStoredCartLines } from "@/lib/stored-cart";
import { paymentIntentIdFromSession, refundStripePayment } from "@/lib/stripe-refund";
import { checkoutEventShouldFulfill } from "@/lib/stripe-events";
import { sendOrderEmail } from "@/lib/order-email";
import { logError } from "@/lib/log";
import {
  applyStripeBillingSignal,
  invoiceSubscriptionId,
  snapshotFromSubscription,
} from "@/lib/stripe-subscription-sync";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe-Signature header." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind === "seller_subscription") {
      await prisma.foundingOfferClaim.updateMany({
        where: { stripeCheckoutSessionId: session.id, status: "PENDING" },
        data: { status: "RELEASED" },
      });
    }
    return NextResponse.json({ received: true });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.trial_will_end"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const snapshot = await snapshotFromSubscription(subscription, event.type === "customer.subscription.deleted");
    const outcome = await applyStripeBillingSignal(
      { kind: "subscription", eventId: event.id, snapshot },
      event.type,
    );
    if (outcome === "retry") {
      return NextResponse.json({ error: "Seller subscription is not ready to record." }, { status: 500 });
    }
    return NextResponse.json({ received: true, outcome });
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (!subscriptionId) return NextResponse.json({ received: true, ignored: "no_subscription" });
    const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
    const sellerProfileId = subscription.metadata.sellerProfileId;
    if (!sellerProfileId) {
      return NextResponse.json({ error: "Seller subscription is not ready to record." }, { status: 500 });
    }
    const outcome = await applyStripeBillingSignal(
      {
        kind: event.type === "invoice.paid" ? "invoice_paid" : "invoice_payment_failed",
        eventId: event.id,
        sellerProfileId,
      },
      event.type,
    );
    if (outcome === "retry") {
      return NextResponse.json({ error: "Seller subscription is not ready to record." }, { status: 500 });
    }
    return NextResponse.json({ received: true, outcome });
  }

  if (!checkoutEventShouldFulfill(event.type)) {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode === "subscription" || session.metadata?.kind === "seller_subscription") {
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subscriptionId) {
      return NextResponse.json({ error: "Subscription checkout is missing a subscription." }, { status: 500 });
    }
    const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price", "discounts"],
    });
    const snapshot = await snapshotFromSubscription(subscription, false);
    const outcome = await applyStripeBillingSignal(
      { kind: "subscription", eventId: event.id, snapshot },
      event.type,
    );
    if (outcome === "retry") {
      return NextResponse.json({ error: "Seller subscription is not ready to record." }, { status: 500 });
    }
    return NextResponse.json({ received: true, outcome });
  }

  const metadata = session.metadata ?? {};
  const stripePaymentId = paymentIntentIdFromSession(session.payment_intent) ?? session.id;

  if (metadata.kind === "placement_slot") {
    return handlePlacementSlotPurchase(session, metadata, stripePaymentId);
  }

  return handleCartCheckout(session, metadata, stripePaymentId);
}

async function handleCartCheckout(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>,
  stripePaymentId: string,
): Promise<NextResponse> {
  const pendingCheckoutId = metadata.pendingCheckoutId;
  if (!pendingCheckoutId) {
    console.error("Stripe webhook: cart checkout missing pendingCheckoutId", { sessionId: session.id });
    return NextResponse.json({ error: "Missing order metadata." }, { status: 400 });
  }

  const pending = await prisma.pendingCheckout.findUnique({ where: { id: pendingCheckoutId } });
  if (!pending) {
    console.error("Stripe webhook: pending checkout not found", { pendingCheckoutId, sessionId: session.id });
    return NextResponse.json({ error: "Missing order metadata." }, { status: 400 });
  }

  const paymentIntentId = paymentIntentIdFromSession(session.payment_intent);
  const stripe = getStripeClient();

  try {
    const result = await fulfillPaidCart({
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      stripePaymentId,
      pending: {
        buyerId: pending.buyerId,
        shippingAddressId: pending.shippingAddressId,
        totalAmountCents: pending.totalAmountCents,
        lines: parseStoredCartLines(pending.linesJson),
        status: pending.status,
        stripePaymentId: pending.stripePaymentId,
        refundDueCents: pending.refundDueCents,
        refundedAmountCents: pending.refundedAmountCents,
      },
      store: createPrismaCheckoutStore(pending.id),
      refund: async (amountCents) => {
        if (!paymentIntentId) {
          throw new Error("Paid session is missing a payment intent, so it cannot be refunded.");
        }
        await refundStripePayment(stripe, paymentIntentId, amountCents);
      },
      savePending: async (patch) => {
        await prisma.pendingCheckout.update({ where: { id: pending.id }, data: patch });
      },
    });

    if (result.outcome === "ignored_unpaid") {
      return NextResponse.json({ received: true, ignored: "unpaid" });
    }
    if (result.outcome === "duplicate") {
      return NextResponse.json({ received: true, orderId: result.orderId });
    }
    if (result.outcome === "refunded") {
      return NextResponse.json({ received: true, refunded: true, reason: result.reason });
    }
    await notifyOrderPlaced(result.orderId, result.refundedCents);
    return NextResponse.json({ received: true, orderId: result.orderId, refundedCents: result.refundedCents });
  } catch (err) {
    console.error("Failed to record order after Stripe payment confirmation:", err, {
      sessionId: session.id,
      stripePaymentId,
    });
    return NextResponse.json({ error: "Failed to record order." }, { status: 500 });
  }
}

async function handlePlacementSlotPurchase(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>,
  stripePaymentId: string,
): Promise<NextResponse> {
  const periodId = metadata.periodId;
  const pageType = metadata.pageType as PlacementPageType | undefined;
  const categoryId = metadata.categoryId ? metadata.categoryId : null;
  const sellerProfileId = metadata.sellerProfileId;

  if (!periodId || !pageType || !sellerProfileId) {
    console.error("Stripe webhook: placement_slot checkout missing expected metadata", {
      sessionId: session.id,
    });
    return NextResponse.json({ error: "Missing placement slot metadata." }, { status: 400 });
  }

  const paymentIntentId = paymentIntentIdFromSession(session.payment_intent);
  const stripe = getStripeClient();

  try {
    const result = await fulfillPlacementSlot({
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      expectedPriceCents: placementSlotPriceCents(pageType),
      findExisting: () => prisma.featuredSlotPurchase.findUnique({ where: { stripePaymentId }, select: { id: true } }),
      assignSlot: () => assignPlacementSlot({ periodId, pageType, categoryId, sellerProfileId, stripePaymentId }),
      refund: async (amountCents) => {
        if (!paymentIntentId) {
          throw new Error("Paid session is missing a payment intent, so it cannot be refunded.");
        }
        await refundStripePayment(stripe, paymentIntentId, amountCents);
      },
    });

    if (result.outcome === "ignored_unpaid") {
      return NextResponse.json({ received: true, ignored: "unpaid" });
    }
    if (result.outcome === "refunded") {
      return NextResponse.json({ received: true, refunded: true, reason: result.reason });
    }
    return NextResponse.json({ received: true, slotPurchaseId: result.slotPurchaseId });
  } catch (err) {
    console.error("Failed to record placement slot after Stripe payment confirmation:", err, {
      sessionId: session.id,
      stripePaymentId,
    });
    return NextResponse.json({ error: "Failed to record placement slot purchase." }, { status: 500 });
  }
}

async function notifyOrderPlaced(orderId: string, refundedCents: number): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, buyer: { select: { email: true } } },
    });
    if (!order?.buyer.email) return;
    await sendOrderEmail({
      to: order.buyer.email,
      kind: "placed",
      orderId: order.id,
      refundCents: refundedCents,
    });
  } catch (err) {
    logError("order-email.placed", err, { orderId });
  }
}

async function assignPlacementSlot(input: {
  periodId: string;
  pageType: PlacementPageType;
  categoryId: string | null;
  sellerProfileId: string;
  stripePaymentId: string;
}): Promise<{ id: string } | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.stripePaymentId})::bigint)`;
    const already = await tx.featuredSlotPurchase.findUnique({
      where: { stripePaymentId: input.stripePaymentId },
      select: { id: true },
    });
    if (already) return already;

    const taken = await tx.featuredSlotPurchase.findMany({
      where: { periodId: input.periodId, pageType: input.pageType, categoryId: input.categoryId },
      select: { slotNumber: true },
    });
    const takenSet = new Set(taken.map((slot) => slot.slotNumber));
    let slotNumber: number | null = null;
    for (let n = 1; n <= PAID_SLOT_COUNT; n++) {
      if (!takenSet.has(n)) {
        slotNumber = n;
        break;
      }
    }
    if (slotNumber === null) return null;

    return tx.featuredSlotPurchase.create({
      data: {
        periodId: input.periodId,
        pageType: input.pageType,
        categoryId: input.categoryId,
        slotNumber,
        sellerProfileId: input.sellerProfileId,
        priceCents: placementSlotPriceCents(input.pageType),
        isRandomFill: false,
        stripePaymentId: input.stripePaymentId,
      },
      select: { id: true },
    });
  });
}
