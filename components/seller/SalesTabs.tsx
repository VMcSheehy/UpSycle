"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FulfillmentMethod, ShippingStatus } from "@prisma/client";

import { formatPriceCents, shippingStatusLabel } from "@/lib/format";

export interface SaleItemView {
  id: string;
  productTitle: string;
  thumbnailUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  shippingCostCents: number;
  refundedAmountCents: number;
  shippingStatus: ShippingStatus;
  fulfillmentMethod: FulfillmentMethod;
  trackingUrl: string | null;
  trackingNumber: string | null;
  canBuyLabel?: boolean;
  labelUrl?: string | null;
  orderedAt: string; // ISO string — Dates aren't passed across the server/client boundary
}

const STATUS_TONE: Record<ShippingStatus, string> = {
  PENDING_SHIPMENT: "text-[var(--rg-light)]",
  SHIPPED: "text-[var(--success)]",
  IN_TRANSIT: "text-[var(--success)]",
  OUT_FOR_DELIVERY: "text-[var(--success)]",
  DELIVERED: "text-[var(--success)]",
  EXCEPTION: "text-[var(--danger)]",
  CANCELLED: "text-[var(--muted2)]",
};

const CARRIER_OPTIONS = ["USPS", "UPS", "FEDEX", "DHL"] as const;

function formatOrderedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Client component so "Mark as Shipped" can PATCH the API and the seller
// sees the item move out of the Pending tab without a full page nav. Tab
// data itself is fetched server-side (app/(seller)/sell/sales/page.tsx) and
// handed down as props; after a successful PATCH we just router.refresh()
// so the server re-queries fresh grouped/ordered data rather than us
// hand-rolling client-side list mutation.
export default function SalesTabs({
  pendingItems,
  historyItems,
}: {
  pendingItems: SaleItemView[];
  historyItems: SaleItemView[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  const [errorFor, setErrorFor] = useState<Record<string, string>>({});
  const [trackingDraft, setTrackingDraft] = useState<Record<string, { carrier: string; number: string }>>({});
  const [, startTransition] = useTransition();

  async function buyLabel(itemId: string, existingUrl?: string | null) {
    if (existingUrl) {
      window.open(existingUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setInFlightIds((prev) => new Set(prev).add(itemId));
    setErrorFor((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    try {
      const res = await fetch(`/api/seller/order-items/${itemId}/label`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not buy the label.");
      if (data.labelUrl) window.open(data.labelUrl, "_blank", "noopener,noreferrer");
      startTransition(() => router.refresh());
    } catch (err) {
      setErrorFor((prev) => ({
        ...prev,
        [itemId]: err instanceof Error ? err.message : "Could not buy the label.",
      }));
    } finally {
      setInFlightIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  async function addTracking(itemId: string) {
    const draft = trackingDraft[itemId] ?? { carrier: "USPS", number: "" };
    setInFlightIds((prev) => new Set(prev).add(itemId));
    setErrorFor((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    try {
      const res = await fetch(`/api/seller/order-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier: draft.carrier, trackingNumber: draft.number }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to save tracking.");
      }
      startTransition(() => router.refresh());
      setInFlightIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    } catch (err) {
      setErrorFor((prev) => ({
        ...prev,
        [itemId]: err instanceof Error ? err.message : "Failed to save tracking.",
      }));
      setInFlightIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  async function updateStatus(itemId: string, shippingStatus: ShippingStatus) {
    if (shippingStatus === "CANCELLED") {
      const ok = window.confirm("Cancel this item and refund the buyer?");
      if (!ok) return;
    }
    setInFlightIds((prev) => new Set(prev).add(itemId));
    setErrorFor((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    try {
      const res = await fetch(`/api/seller/order-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippingStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to update.");
      }
      startTransition(() => router.refresh());
      setInFlightIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    } catch (err) {
      setErrorFor((prev) => ({
        ...prev,
        [itemId]: err instanceof Error ? err.message : "Failed to update.",
      }));
      setInFlightIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  const items = tab === "pending" ? pendingItems : historyItems;
  const tabBtnClass = (active: boolean) =>
    `px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] transition-colors ${
      active
        ? "border-b-2 border-[var(--rg-core)] text-[var(--rg-light)]"
        : "border-b-2 border-transparent text-[var(--muted)] hover:text-[var(--cream)]"
    }`;

  return (
    <div>
      <div className="mb-6 flex gap-2 border-b border-[var(--border)]">
        <button type="button" onClick={() => setTab("pending")} className={tabBtnClass(tab === "pending")}>
          Pending Shipment ({pendingItems.length})
        </button>
        <button type="button" onClick={() => setTab("history")} className={tabBtnClass(tab === "history")}>
          Order History ({historyItems.length})
        </button>
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-[0.85rem] font-light text-[var(--muted2)]">
          {tab === "pending" ? "No items waiting to ship." : "No completed orders yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 border-b border-[var(--border2)] py-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden bg-[var(--deep)]">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external/S3 photo URLs, no fixed domain configured yet
                    <img
                      src={item.thumbnailUrl}
                      alt={item.productTitle}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-center text-[0.5rem] uppercase tracking-[0.1em] text-[var(--muted)]">
                      No Photo
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.9rem] text-[var(--cream)]">{item.productTitle}</div>
                  <div className="text-[0.72rem] font-light text-[var(--muted2)]">
                    Qty {item.quantity} · Ordered {formatOrderedDate(item.orderedAt)}
                  </div>
                  {item.trackingUrl ? (
                    <a
                      href={item.trackingUrl}
                      className="text-[0.72rem] text-[var(--rg-light)]"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.trackingNumber ?? "Track package"}
                    </a>
                  ) : null}
                  {item.fulfillmentMethod === "SHIP" && !item.trackingNumber && item.shippingStatus !== "CANCELLED" && item.shippingStatus !== "DELIVERED" ? (
                    <form
                      className="mt-2 flex flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addTracking(item.id);
                      }}
                    >
                      <select
                        aria-label="Carrier"
                        value={trackingDraft[item.id]?.carrier ?? "USPS"}
                        onChange={(event) =>
                          setTrackingDraft((prev) => ({
                            ...prev,
                            [item.id]: { carrier: event.target.value, number: prev[item.id]?.number ?? "" },
                          }))
                        }
                        className="border border-[var(--border)] bg-[var(--black)] px-2 py-1 text-[0.72rem] text-[var(--cream)]"
                      >
                        {CARRIER_OPTIONS.map((carrier) => (
                          <option key={carrier} value={carrier}>
                            {carrier === "FEDEX" ? "FedEx" : carrier}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Tracking number"
                        value={trackingDraft[item.id]?.number ?? ""}
                        onChange={(event) =>
                          setTrackingDraft((prev) => ({
                            ...prev,
                            [item.id]: { carrier: prev[item.id]?.carrier ?? "USPS", number: event.target.value },
                          }))
                        }
                        placeholder="Tracking number"
                        className="w-40 border border-[var(--border)] bg-[var(--black)] px-2 py-1 text-[0.72rem] text-[var(--cream)]"
                      />
                      <button
                        type="submit"
                        disabled={inFlightIds.has(item.id)}
                        className="text-[0.62rem] uppercase tracking-[0.1em] text-[var(--rg-light)] disabled:opacity-50"
                      >
                        Add tracking
                      </button>
                    </form>
                  ) : null}
                  {errorFor[item.id] && (
                    <div className="mt-1 text-[0.7rem] text-[var(--danger)]">{errorFor[item.id]}</div>
                  )}
                </div>

                <div className="w-24 shrink-0 text-right text-[0.9rem] text-[var(--cream)]">
                  {formatPriceCents(item.unitPriceCents * item.quantity)}
                </div>

                <div className="flex w-52 shrink-0 flex-col items-end gap-2">
                  {item.shippingStatus === "PENDING_SHIPMENT" ? (
                    <>
                      {item.canBuyLabel || item.labelUrl ? (
                        <button
                          type="button"
                          onClick={() => buyLabel(item.id, item.labelUrl)}
                          disabled={inFlightIds.has(item.id)}
                          className="btn-primary px-4 py-2 text-[0.62rem] disabled:opacity-50"
                        >
                          {item.labelUrl ? "Print label" : "Buy & print label"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => updateStatus(item.id, "SHIPPED")}
                        disabled={inFlightIds.has(item.id)}
                        className="btn-secondary px-4 py-2 text-[0.62rem] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {inFlightIds.has(item.id)
                          ? "Saving…"
                          : item.fulfillmentMethod === "PICKUP"
                            ? "Mark as Picked Up"
                            : "Mark as Shipped"}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStatus(item.id, "CANCELLED")}
                        disabled={inFlightIds.has(item.id)}
                        className="text-[0.62rem] uppercase tracking-[0.1em] text-[var(--muted)] underline disabled:opacity-50"
                      >
                        Cancel and refund
                      </button>
                    </>
                  ) : item.fulfillmentMethod === "SHIP" &&
                    (item.shippingStatus === "SHIPPED" ||
                      item.shippingStatus === "IN_TRANSIT" ||
                      item.shippingStatus === "OUT_FOR_DELIVERY" ||
                      item.shippingStatus === "EXCEPTION") ? (
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, "DELIVERED")}
                      disabled={inFlightIds.has(item.id)}
                      className="btn-secondary px-4 py-2 text-[0.62rem] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {inFlightIds.has(item.id) ? "Saving…" : "Mark as delivered"}
                    </button>
                  ) : item.shippingStatus === "CANCELLED" &&
                    item.refundedAmountCents < item.unitPriceCents * item.quantity + item.shippingCostCents ? (
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, "CANCELLED")}
                      disabled={inFlightIds.has(item.id)}
                      className="btn-secondary px-4 py-2 text-[0.62rem] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {inFlightIds.has(item.id) ? "Saving…" : "Retry refund"}
                    </button>
                  ) : (
                    <span
                      className={`text-[0.65rem] font-semibold uppercase tracking-[0.1em] ${STATUS_TONE[item.shippingStatus]}`}
                    >
                      {shippingStatusLabel(item.shippingStatus, item.fulfillmentMethod)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
