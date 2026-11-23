// Buys the EasyPost label for the rate the buyer already paid, then marks
// the seller's lines shipped with the tracking number from that label.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { aggregateOrderStatus } from "@/lib/order-status";
import { sendOrderEmail } from "@/lib/order-email";
import { prisma } from "@/lib/prisma";
import { getApprovedSeller } from "@/lib/require-seller";
import { canBuyLabel } from "@/lib/shipping";
import { carrierTrackingUrl, parseCarrier } from "@/lib/tracking";
import { getTrackingProvider } from "@/lib/tracking-provider";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const seller = await getApprovedSeller();
  if (!seller) {
    return NextResponse.json({ error: "You must be an approved seller to do this." }, { status: 401 });
  }
  const { id } = await params;
  const orderItem = await prisma.orderItem.findUnique({
    where: { id },
    include: {
      shipment: true,
      product: { select: { title: true } },
      order: {
        select: {
          id: true,
          buyer: { select: { email: true } },
          items: { select: { id: true, shippingStatus: true, sellerProfileId: true, fulfillmentMethod: true, product: { select: { title: true } } } },
        },
      },
    },
  });
  if (!orderItem || orderItem.sellerProfileId !== seller.sellerProfile.id || !orderItem.shipment) {
    return NextResponse.json({ error: "Order item not found." }, { status: 404 });
  }

  const plan = canBuyLabel(orderItem.shipment);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 409 });
  if (plan.alreadyPurchased && orderItem.shipment.labelUrl) {
    return NextResponse.json({ labelUrl: orderItem.shipment.labelUrl, trackingNumber: orderItem.shipment.trackingNumber });
  }

  const provider = getTrackingProvider();
  if (!provider) {
    return NextResponse.json({ error: "Label buying is not configured yet." }, { status: 503 });
  }

  const coverageDollars =
    orderItem.shipment.insured && orderItem.shipment.insuranceCents > 0
      ? await coverageForShipment(orderItem.shipment.id)
      : null;
  const purchased = await provider.buyLabel({
    shipmentId: orderItem.shipment.easypostShipmentId!,
    rateId: orderItem.shipment.easypostRateId!,
    insuranceDollars: coverageDollars,
  });
  if (!purchased) {
    return NextResponse.json({ error: "The label could not be bought. Try again in a moment." }, { status: 502 });
  }

  const carrier = parseCarrier(orderItem.shipment.carrier ?? "");
  const trackingUrl = purchased.publicUrl || (carrier ? carrierTrackingUrl(carrier, purchased.trackingNumber) : purchased.labelUrl);
  const lines = orderItem.order.items.filter(
    (item) => item.sellerProfileId === orderItem.sellerProfileId && item.fulfillmentMethod === "SHIP",
  );

  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: orderItem.shipment!.id },
      data: { labelUrl: purchased.labelUrl, trackingNumber: purchased.trackingNumber },
    });
    for (const line of lines) {
      if (line.shippingStatus === "CANCELLED" || line.shippingStatus === "DELIVERED") continue;
      await tx.orderItem.update({
        where: { id: line.id },
        data: {
          trackingNumber: purchased.trackingNumber,
          trackingUrl,
          carrier: carrier ?? undefined,
          trackingProvider: "easypost",
          shippingStatus: line.shippingStatus === "PENDING_SHIPMENT" ? "SHIPPED" : line.shippingStatus,
        },
      });
    }
    const statuses = await tx.orderItem.findMany({
      where: { orderId: orderItem.orderId },
      select: { shippingStatus: true },
    });
    await tx.order.update({
      where: { id: orderItem.orderId },
      data: { shippingStatus: aggregateOrderStatus(statuses.map((line) => line.shippingStatus)) },
    });
  });

  await sendOrderEmail({
    to: orderItem.order.buyer.email,
    kind: "shipped",
    orderId: orderItem.order.id,
    productTitle: lines[0]?.product.title ?? orderItem.product.title,
    trackingUrl,
  });

  return NextResponse.json({ labelUrl: purchased.labelUrl, trackingNumber: purchased.trackingNumber });
}

async function coverageForShipment(shipmentId: string): Promise<string | null> {
  const items = await prisma.orderItem.findMany({
    where: { shipmentId, fulfillmentMethod: "SHIP" },
    select: { unitPriceCents: true, quantity: true },
  });
  const cents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  if (cents <= 0) return null;
  return (cents / 100).toFixed(2);
}
