import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { FulfillmentMethod, ShippingStatus } from "@prisma/client";

import SalesTabs, { type SaleItemView } from "@/components/seller/SalesTabs";
import { formatPriceCents } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSellerSessionState } from "@/lib/require-seller";

export const metadata: Metadata = {
  title: "Sales Dashboard — UpSycle Market",
  description: "Track pending shipments and monthly sales for your UpSycle Market shop.",
};

// Reads live session + order/shipment state on every request — never
// statically rendered.
export const dynamic = "force-dynamic";

interface OrderItemWithProduct {
  id: string;
  quantity: number;
  unitPriceCents: number;
  shippingCostCents: number;
  refundedAmountCents: number;
  shippingStatus: ShippingStatus;
  fulfillmentMethod: FulfillmentMethod;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shipment: { mode: string; easypostShipmentId: string | null; easypostRateId: string | null; labelUrl: string | null } | null;
  createdAt: Date;
  product: { title: string; photos: { url: string }[] };
}

function toSaleItemView(item: OrderItemWithProduct): SaleItemView {
  return {
    id: item.id,
    productTitle: item.product.title,
    thumbnailUrl: item.product.photos[0]?.url ?? null,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    shippingCostCents: item.shippingCostCents,
    refundedAmountCents: item.refundedAmountCents,
    shippingStatus: item.shippingStatus,
    fulfillmentMethod: item.fulfillmentMethod,
    trackingNumber: item.trackingNumber,
    trackingUrl: item.trackingUrl,
    canBuyLabel: Boolean(
      item.fulfillmentMethod === "SHIP" &&
        item.shippingStatus === "PENDING_SHIPMENT" &&
        item.shipment?.mode === "calculated" &&
        item.shipment.easypostShipmentId &&
        item.shipment.easypostRateId &&
        !item.shipment.labelUrl,
    ),
    labelUrl: item.shipment?.labelUrl ?? null,
    orderedAt: item.createdAt.toISOString(),
  };
}

export default async function SellerSalesPage() {
  const state = await getSellerSessionState();

  // "Must be an APPROVED seller" guard (issue #13 requirement #1). Route to
  // wherever makes sense for each state rather than a single generic
  // redirect, mirroring how the rest of the seller area is wired up.
  if (state.status === "unauthenticated") {
    redirect("/login?redirectTo=/sell/sales");
  }
  if (state.status === "no-profile") {
    redirect("/sell/signup");
  }
  if (state.status === "not-approved") {
    redirect("/sell/pending");
  }

  const sellerProfileId = state.sellerProfile.id;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const productInclude = {
    shipment: true,
    product: {
      select: {
        title: true,
        photos: { orderBy: { position: "asc" as const }, take: 1, select: { url: true } },
      },
    },
  };

  const [pending, history, monthItems] = await Promise.all([
    prisma.orderItem.findMany({
      where: { sellerProfileId, shippingStatus: "PENDING_SHIPMENT" },
      include: productInclude,
      orderBy: { createdAt: "asc" },
    }),
    prisma.orderItem.findMany({
      where: { sellerProfileId, shippingStatus: { not: "PENDING_SHIPMENT" } },
      include: productInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    // Revenue/sold-count summary excludes CANCELLED items — a cancelled line
    // item was never actually "sold" even though the row exists this month.
    prisma.orderItem.findMany({
      where: { sellerProfileId, createdAt: { gte: startOfMonth }, shippingStatus: { not: "CANCELLED" } },
      select: { unitPriceCents: true, quantity: true },
    }),
  ]);

  const soldCountThisMonth = monthItems.reduce((sum, i) => sum + i.quantity, 0);
  const revenueCentsThisMonth = monthItems.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

  const pendingItems = pending.map(toSaleItemView);
  const historyItems = history.map(toSaleItemView);

  return (
    <div>
      <div className="mb-10">
        <div className="eyebrow before:hidden">Seller Dashboard</div>
        <h1 className="sec-title">
          Your <em>Sales</em>
        </h1>
        <p className="max-w-xl text-[0.95rem] font-light leading-loose text-[var(--muted2)]">
          Track incoming orders, mark items shipped or delivered, and cancel a line that has not shipped yet. A cancel refunds that line.
        </p>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="border border-[var(--border)] bg-[var(--charcoal)] p-6">
          <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-[var(--muted)]">
            Sold This Month
          </div>
          <div className="font-serif text-[2rem] text-[var(--cream)]">{soldCountThisMonth}</div>
          <div className="text-[0.78rem] font-light text-[var(--muted2)]">
            item{soldCountThisMonth === 1 ? "" : "s"} sold
          </div>
        </div>
        <div className="border border-[var(--border)] bg-[var(--charcoal)] p-6">
          <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-[var(--muted)]">
            Revenue This Month
          </div>
          <div className="grad-text font-serif text-[2rem] font-semibold">
            {formatPriceCents(revenueCentsThisMonth)}
          </div>
          <div className="text-[0.78rem] font-light text-[var(--muted2)]">unit price × quantity</div>
        </div>
      </div>

      <SalesTabs pendingItems={pendingItems} historyItems={historyItems} />
    </div>
  );
}
