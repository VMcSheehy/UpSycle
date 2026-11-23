"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/hooks/useCart";
import { formatPriceCents } from "@/lib/format";

interface AddressOption {
  id: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

interface ResolvedLine {
  productId: string;
  quantity: number;
  title?: string;
  sellerName?: string;
  priceCents?: number;
  shippingCostCents?: number;
  inventoryCount?: number;
  available?: boolean;
  offersLocalPickup?: boolean;
  pickupCity?: string | null;
  pickupState?: string | null;
  sellerProfileId?: string;
  needsFreightQuote?: boolean;
  shippingMode?: "live" | "flat" | "freight";
}

interface SellerRateGroup {
  sellerProfileId: string;
  sellerName: string;
  mode: "calculated" | "flat" | "freight";
  flatCents?: number;
  insuranceDefault?: boolean;
  insuranceFeeCents?: number;
  rates?: Array<{
    id: string;
    carrier: string;
    service: string;
    speed: "ground" | "express";
    deliveryDays: number | null;
    buyerChargeCents: number;
  }>;
}

type FulfillmentMethod = "SHIP" | "PICKUP";

export default function CheckoutClient({ addresses }: { addresses: AddressOption[] }) {
  const { items, hydrated } = useCart();
  const [lines, setLines] = useState<ResolvedLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [addressId, setAddressId] = useState<string | undefined>(addresses[0]?.id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fulfillmentByProduct, setFulfillmentByProduct] = useState<Record<string, FulfillmentMethod>>({});
  const [rateGroups, setRateGroups] = useState<SellerRateGroup[]>([]);
  const [rateChoice, setRateChoice] = useState<Record<string, string>>({});
  const [insuredBySeller, setInsuredBySeller] = useState<Record<string, boolean>>({});
  const [ratesLoading, setRatesLoading] = useState(false);

  const fulfillmentFor = (productId: string): FulfillmentMethod => fulfillmentByProduct[productId] ?? "SHIP";
  const effectiveShippingCents = (line: ResolvedLine): number =>
    line.offersLocalPickup && fulfillmentFor(line.productId) === "PICKUP" ? 0 : (line.shippingCostCents ?? 0);

  useEffect(() => {
    // Nothing to resolve for an empty (or not-yet-hydrated) cart — the
    // render below shows the empty state directly from `items`.
    if (!hydrated || items.length === 0) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-with-loading-flag pattern; the async .then/.finally below do the real sync
    setLoading(true);
    fetch("/api/cart/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setLines(data.lines ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, items]);

  useEffect(() => {
    if (!hydrated || !addressId || lines.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch starts after the address is known; results land in the callbacks
    setRatesLoading(true);
    fetch("/api/shipping/rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shippingAddressId: addressId,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          fulfillmentMethod: fulfillmentFor(line.productId),
        })),
      }),
    })
      .then((res) => res.json())
      .then((data: { sellers?: SellerRateGroup[] }) => {
        if (cancelled) return;
        const sellers = data.sellers ?? [];
        setRateGroups(sellers);
        setRateChoice((current) => {
          const next = { ...current };
          for (const seller of sellers) {
            if (seller.mode === "calculated" && seller.rates?.[0] && !next[seller.sellerProfileId]) {
              next[seller.sellerProfileId] = seller.rates[0].id;
            }
          }
          return next;
        });
        setInsuredBySeller((current) => {
          const next = { ...current };
          for (const seller of sellers) {
            if (next[seller.sellerProfileId] === undefined && seller.insuranceDefault) {
              next[seller.sellerProfileId] = true;
            }
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setRatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // fulfillmentFor changes with fulfillmentByProduct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, addressId, lines, fulfillmentByProduct]);

  const validLines = lines.filter((l) => l.priceCents != null && l.available !== false);
  const subtotalCents = validLines.reduce((sum, l) => sum + (l.priceCents ?? 0) * l.quantity, 0);
  const calculatedShipping = rateGroups.some((group) => group.mode === "calculated");
  const shippingCents = calculatedShipping
    ? rateGroups.reduce((sum, group) => {
        if (group.mode === "flat") return sum + (group.flatCents ?? 0);
        if (group.mode !== "calculated") return sum;
        const chosen = group.rates?.find((rate) => rate.id === rateChoice[group.sellerProfileId]) ?? group.rates?.[0];
        const insurance = insuredBySeller[group.sellerProfileId] ? (group.insuranceFeeCents ?? 0) : 0;
        return sum + (chosen?.buyerChargeCents ?? 0) + insurance;
      }, 0)
    : validLines.reduce((sum, line) => sum + effectiveShippingCents(line), 0);
  const totalCents = subtotalCents + shippingCents;
  const distinctSellers = new Set(validLines.map((l) => l.sellerName).filter(Boolean));
  const hasShippingLine = validLines.some(
    (l) => !(l.offersLocalPickup && fulfillmentFor(l.productId) === "PICKUP"),
  );

  const canSubmit =
    hydrated &&
    !loading &&
    validLines.length === lines.length &&
    lines.length > 0 &&
    (!hasShippingLine || !!addressId) &&
    !ratesLoading &&
    !rateGroups.some((group) => group.mode === "freight") &&
    rateGroups.every((group) => group.mode !== "calculated" || Boolean(rateChoice[group.sellerProfileId] || group.rates?.[0]));

  async function handlePay() {
    if (hasShippingLine && !addressId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ ...i, fulfillmentMethod: fulfillmentFor(i.productId) })),
          shippingAddressId: hasShippingLine ? addressId : undefined,
          shipments: rateGroups
            .filter((group) => group.mode === "calculated")
            .map((group) => ({
              sellerProfileId: group.sellerProfileId,
              rateId: rateChoice[group.sellerProfileId] ?? group.rates?.[0]?.id,
              insured: Boolean(insuredBySeller[group.sellerProfileId]),
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start checkout. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return <p className="mt-10 text-[0.9rem] font-light text-[var(--muted2)]">Loading your order…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="mt-10">
        <p className="mb-6 text-[0.9rem] font-light text-[var(--muted2)]">
          Your cart is empty — nothing to check out.
        </p>
        <Link href="/browse" className="btn-primary">
          Browse the Marketplace
        </Link>
      </div>
    );
  }

  if (loading) {
    return <p className="mt-10 text-[0.9rem] font-light text-[var(--muted2)]">Loading your order…</p>;
  }

  return (
    <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px]">
      <div>
        {hasShippingLine ? (
          <>
            <h2 className="mb-4 font-serif text-[1.2rem] text-[var(--cream)]">Shipping Address</h2>
            {addresses.length === 0 ? (
              <p className="form-error">
                We couldn&rsquo;t find a saved shipping address on your account. Please contact support.
              </p>
            ) : (
              <div className="mb-10 space-y-3">
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={`flex cursor-pointer items-start gap-3 border p-4 text-[0.85rem] ${
                      addressId === address.id
                        ? "border-[var(--rg-core)] bg-[var(--panel)]"
                        : "border-[var(--border)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      className="mt-1"
                      checked={addressId === address.id}
                      onChange={() => setAddressId(address.id)}
                    />
                    <span className="text-[var(--muted2)]">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ""}
                      <br />
                      {address.city}, {address.state} {address.postalCode}
                      <br />
                      {address.country}
                      {address.isDefault && (
                        <span className="ml-2 text-[0.6rem] uppercase tracking-[0.12em] text-[var(--rg-core)]">
                          Default
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="form-hint mb-10">
            All items in this order are set for local pickup — no shipping address needed.
          </p>
        )}

        {ratesLoading ? <p className="mb-8 text-[0.85rem] text-[var(--muted2)]">Finding shipping rates…</p> : null}
        {rateGroups.some((group) => group.mode === "calculated" || group.mode === "freight") ? (
          <div className="mb-10" id="shipping-rates">
            <h2 className="mb-4 font-serif text-[1.2rem] text-[var(--cream)]">Shipping speed</h2>
            {rateGroups.map((group) => (
              <div key={group.sellerProfileId} className="mb-6 border border-[var(--border)] p-4">
                <div className="mb-3 text-[0.75rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                  From {group.sellerName}
                </div>
                {group.mode === "freight" ? (
                  <p className="text-[0.85rem] text-[var(--muted2)]">
                    An item from this seller needs a freight quote and cannot be checked out here.
                  </p>
                ) : null}
                {group.mode === "flat" ? (
                  <p className="text-[0.85rem] text-[var(--cream)]">
                    Seller flat rate {formatPriceCents(group.flatCents ?? 0)}
                  </p>
                ) : null}
                {group.mode === "calculated"
                  ? group.rates?.map((rate) => (
                      <label key={rate.id} className="mb-2 flex cursor-pointer items-start gap-3 text-[0.85rem]">
                        <input
                          type="radio"
                          name={`rate-${group.sellerProfileId}`}
                          className="mt-1"
                          checked={(rateChoice[group.sellerProfileId] ?? group.rates?.[0]?.id) === rate.id}
                          onChange={() => setRateChoice((current) => ({ ...current, [group.sellerProfileId]: rate.id }))}
                        />
                        <span>
                          <span className="text-[var(--cream)]">
                            {rate.carrier} {rate.service}
                          </span>
                          <span className="ml-2 text-[0.65rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                            {rate.speed === "express" ? "Express" : "Ground"}
                          </span>
                          <span className="mt-1 block text-[var(--muted2)]">
                            {formatPriceCents(rate.buyerChargeCents)}
                            {rate.deliveryDays ? ` · about ${rate.deliveryDays} day${rate.deliveryDays === 1 ? "" : "s"}` : ""}
                          </span>
                        </span>
                      </label>
                    ))
                  : null}
                {group.mode === "calculated" && (group.insuranceFeeCents ?? 0) > 0 ? (
                  <label className="mt-3 flex items-center gap-3 text-[0.85rem] text-[var(--cream)]">
                    <input
                      type="checkbox"
                      checked={Boolean(insuredBySeller[group.sellerProfileId])}
                      onChange={(event) =>
                        setInsuredBySeller((current) => ({ ...current, [group.sellerProfileId]: event.target.checked }))
                      }
                    />
                    Add shipping insurance ({formatPriceCents(group.insuranceFeeCents ?? 0)})
                  </label>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <h2 className="mb-4 font-serif text-[1.2rem] text-[var(--cream)]">Items</h2>
        <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {lines.map((line) => (
            <div key={line.productId} className="flex items-center justify-between gap-4 py-4 text-[0.85rem]">
              <div>
                <div className="text-[var(--cream)]">
                  {line.title ?? "Unavailable listing"} × {line.quantity}
                </div>
                {line.sellerName && (
                  <div className="text-[0.62rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                    Sold by {line.sellerName}
                  </div>
                )}
                {line.available === false && (
                  <div className="mt-1 text-[0.72rem] text-[var(--danger)]">
                    No longer available — go back to your cart to remove it.
                  </div>
                )}
                {line.offersLocalPickup && (
                  <div className="mt-2 flex gap-4 text-[0.72rem]">
                    <label className="flex items-center gap-1.5 text-[var(--muted2)]">
                      <input
                        type="radio"
                        name={`fulfillment-${line.productId}`}
                        checked={fulfillmentFor(line.productId) === "SHIP"}
                        onChange={() =>
                          setFulfillmentByProduct((prev) => ({ ...prev, [line.productId]: "SHIP" }))
                        }
                      />
                      Ship to Me
                    </label>
                    <label className="flex items-center gap-1.5 text-[var(--muted2)]">
                      <input
                        type="radio"
                        name={`fulfillment-${line.productId}`}
                        checked={fulfillmentFor(line.productId) === "PICKUP"}
                        onChange={() =>
                          setFulfillmentByProduct((prev) => ({ ...prev, [line.productId]: "PICKUP" }))
                        }
                      />
                      Local Pickup{line.pickupCity ? ` — ${line.pickupCity}, ${line.pickupState}` : ""}
                    </label>
                  </div>
                )}
              </div>
              {line.priceCents != null && (
                <div className="shrink-0 text-[var(--cream)]">
                  {formatPriceCents(line.priceCents * line.quantity + effectiveShippingCents(line))}
                </div>
              )}
            </div>
          ))}
        </div>

        {distinctSellers.size > 1 && (
          <p className="form-hint mt-4">
            This order includes items from {distinctSellers.size} different sellers. It will be paid for as a
            single charge to UpSycle Market; each seller ships their own items independently, and you can track
            each item&rsquo;s shipping status separately once the order is placed.
          </p>
        )}
      </div>

      <aside className="h-fit border border-[var(--border)] bg-[var(--charcoal)] p-6">
        <h2 className="mb-5 font-serif text-[1.2rem] text-[var(--cream)]">Order Total</h2>
        <dl className="mb-6 space-y-2 text-[0.85rem]">
          <div className="flex justify-between">
            <dt className="text-[var(--muted)]">Subtotal</dt>
            <dd className="text-[var(--cream)]">{formatPriceCents(subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--muted)]">Shipping</dt>
            <dd className="text-[var(--cream)]">{formatPriceCents(shippingCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-2 font-semibold">
            <dt className="text-[var(--cream)]">Total</dt>
            <dd className="grad-text">{formatPriceCents(totalCents)}</dd>
          </div>
        </dl>

        {error && <div className="form-error">{error}</div>}

        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={handlePay}
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Redirecting to Payment…" : "Pay with Stripe"}
        </button>
        <p className="form-hint" style={{ marginTop: "10px" }}>
          You&rsquo;ll be redirected to Stripe&rsquo;s secure checkout to complete payment.
        </p>
      </aside>
    </div>
  );
}
