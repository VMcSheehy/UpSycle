// Seller updates one line: ship, mark delivered, or cancel.
// Cancel refunds that line on the original Stripe charge and puts the
// quantity back in stock. The order's shipping status is the summary of
// its lines. A failed refund can be retried by sending cancelled again.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { ShippingStatus } from "@prisma/client";

import { logError } from "@/lib/log";
import { aggregateOrderStatus, lineChargeCents, planOrderItemChange, type LineStatus } from "@/lib/order-status";
import { sendOrderEmail } from "@/lib/order-email";
import { prisma } from "@/lib/prisma";
import { getApprovedSeller } from "@/lib/require-seller";
import { getStripeClient } from "@/lib/stripe";
import { refundStripePayment } from "@/lib/stripe-refund";
import { planTrackingAddition } from "@/lib/tracking";
import { getTrackingProvider } from "@/lib/tracking-provider";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const seller = await getApprovedSeller();
  if (!seller) {
    return NextResponse.json({ error: "You must be an approved seller to do this." }, { status: 401 });
  }

  const { id } = await params;

  let body: { shippingStatus?: string; carrier?: string; trackingNumber?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const orderItem = await prisma.orderItem.findUnique({
    where: { id },
    include: {
      product: { select: { title: true } },
      order: { select: { id: true, stripePaymentId: true, buyer: { select: { email: true } } } },
    },
  });

  if (!orderItem || orderItem.sellerProfileId !== seller.sellerProfile.id) {
    return NextResponse.json({ error: "Order item not found." }, { status: 404 });
  }

  if (body.trackingNumber || body.carrier) {
    return addTracking(orderItem, body);
  }
  if (!body.shippingStatus) {
    return NextResponse.json({ error: "Choose shipped, delivered, or cancelled." }, { status: 400 });
  }

  const chargeCents = lineChargeCents(orderItem);
  const plan = planOrderItemChange({
    current: orderItem.shippingStatus,
    requested: body.shippingStatus,
    refundedAmountCents: orderItem.refundedAmountCents,
    chargeCents,
    hasPayment: Boolean(orderItem.order.stripePaymentId),
  });

  if (plan.kind === "reject") {
    return NextResponse.json({ error: plan.error }, { status: plan.status });
  }

  if (plan.kind === "finish-refund") {
    const stripeRefundId = await refundLine(orderItem.order.stripePaymentId, plan.amountCents, orderItem.id);
    if (!stripeRefundId && plan.amountCents > 0) {
      return NextResponse.json(
        { error: "The refund did not go through. Please try again." },
        { status: 502 },
      );
    }
    const updated = await prisma.orderItem.update({
      where: { id: orderItem.id },
      data: {
        refundedAmountCents: orderItem.refundedAmountCents + plan.amountCents,
        stripeRefundId: stripeRefundId ?? orderItem.stripeRefundId,
      },
    });
    await notifyBuyer(
      "CANCELLED",
      orderItem.order.buyer.email,
      orderItem.order.id,
      orderItem.product.title,
      plan.amountCents,
    );
    return NextResponse.json({ orderItem: updated });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.orderItem.updateMany({
      where: { id: orderItem.id, sellerProfileId: seller.sellerProfile.id, shippingStatus: orderItem.shippingStatus },
      data: { shippingStatus: plan.to },
    });
    if (changed.count !== 1) return null;

    if (plan.restoreStock) {
      await tx.product.update({
        where: { id: orderItem.productId },
        data: { inventoryCount: { increment: orderItem.quantity } },
      });
    }

    const lines = await tx.orderItem.findMany({
      where: { orderId: orderItem.orderId },
      select: { shippingStatus: true },
    });
    await tx.order.update({
      where: { id: orderItem.orderId },
      data: { shippingStatus: aggregateOrderStatus(lines.map((line) => line.shippingStatus)) },
    });

    return tx.orderItem.findUnique({ where: { id: orderItem.id } });
  });

  if (!updated) {
    return NextResponse.json(
      { error: "That status change is not available for this item." },
      { status: 409 },
    );
  }

  if (plan.refundCents > 0) {
    const stripeRefundId = await refundLine(orderItem.order.stripePaymentId, plan.refundCents, orderItem.id);
    if (!stripeRefundId) {
      return NextResponse.json(
        {
          error:
            "The item is cancelled, but the refund did not go through. Choose cancelled again to retry the refund.",
        },
        { status: 502 },
      );
    }
    await prisma.orderItem.update({
      where: { id: orderItem.id },
      data: { refundedAmountCents: plan.refundCents, stripeRefundId },
    });
  }

  await notifyBuyer(plan.to, orderItem.order.buyer.email, orderItem.order.id, orderItem.product.title, plan.refundCents);

  return NextResponse.json({ orderItem: updated });
}

async function addTracking(
  orderItem: {
    id: string;
    orderId: string;
    productId: string;
    fulfillmentMethod: "SHIP" | "PICKUP";
    shippingStatus: LineStatus;
    trackingNumber: string | null;
    product: { title: string };
    order: { id: string; buyer: { email: string } };
  },
  body: { carrier?: string; trackingNumber?: string },
) {
  const draft = planTrackingAddition({
    fulfillment: orderItem.fulfillmentMethod,
    current: orderItem.shippingStatus,
    alreadyHasTracking: Boolean(orderItem.trackingNumber),
    carrier: body.carrier,
    trackingNumber: body.trackingNumber,
  });
  if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: draft.status });

  const registered = await getTrackingProvider()?.register({
    carrier: draft.carrier,
    trackingNumber: draft.trackingNumber,
  });
  const planned = planTrackingAddition({
    fulfillment: orderItem.fulfillmentMethod,
    current: orderItem.shippingStatus,
    alreadyHasTracking: Boolean(orderItem.trackingNumber),
    carrier: draft.carrier,
    trackingNumber: draft.trackingNumber,
    providerStatus: registered?.status,
    providerDetail: registered?.statusDetail,
  });
  if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: planned.status });

  const trackingUrl = registered?.publicUrl || planned.trackingUrl;
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.orderItem.updateMany({
      where: {
        id: orderItem.id,
        shippingStatus: orderItem.shippingStatus,
        trackingNumber: null,
      },
      data: {
        carrier: planned.carrier,
        trackingNumber: planned.trackingNumber,
        trackingUrl,
        trackingProvider: registered?.trackerId ? "easypost" : null,
        providerTrackerId: registered?.trackerId,
        shippingStatus: planned.nextStatus,
      },
    });
    if (changed.count !== 1) return null;
    const lines = await tx.orderItem.findMany({
      where: { orderId: orderItem.orderId },
      select: { shippingStatus: true },
    });
    await tx.order.update({
      where: { id: orderItem.orderId },
      data: { shippingStatus: aggregateOrderStatus(lines.map((line) => line.shippingStatus)) },
    });
    return tx.orderItem.findUnique({ where: { id: orderItem.id } });
  });

  if (!updated) {
    return NextResponse.json({ error: "This item already has a tracking number." }, { status: 409 });
  }

  await sendOrderEmail({
    to: orderItem.order.buyer.email,
    kind: "shipped",
    orderId: orderItem.order.id,
    productTitle: orderItem.product.title,
    trackingUrl,
  });
  if (planned.nextStatus === "DELIVERED" || planned.nextStatus === "EXCEPTION") {
    await sendOrderEmail({
      to: orderItem.order.buyer.email,
      kind: planned.nextStatus === "DELIVERED" ? "delivered" : "exception",
      orderId: orderItem.order.id,
      productTitle: orderItem.product.title,
      trackingUrl,
      detail: registered?.statusDetail,
    });
  }

  return NextResponse.json({ orderItem: updated });
}

async function refundLine(
  stripePaymentId: string | null,
  amountCents: number,
  orderItemId: string,
): Promise<string | undefined> {
  if (!stripePaymentId || amountCents <= 0) return undefined;
  try {
    return await refundStripePayment(
      getStripeClient(),
      stripePaymentId,
      amountCents,
      `order-item-${orderItemId}`,
    );
  } catch (err) {
    logError("order-item.refund", err, { orderItemId });
    return undefined;
  }
}

async function notifyBuyer(
  status: ShippingStatus,
  email: string,
  orderId: string,
  productTitle: string,
  refundCents: number,
): Promise<void> {
  const kind =
    status === "SHIPPED" ? "shipped" : status === "DELIVERED" ? "delivered" : status === "CANCELLED" ? "cancelled" : null;
  if (!kind) return;
  await sendOrderEmail({ to: email, kind, orderId, productTitle, refundCents });
}
