"use client";

import { useState } from "react";
import {
  formatTierPrice,
  planAnnualPriceCents,
  type BillingInterval,
  type SellerPlan,
  type SellerTierId,
} from "@/lib/tiers";

export default function SellerPlanPicker({
  plans,
  foundingOffer,
  canManageBilling,
  initialInterval = "month",
}: {
  plans: SellerPlan[];
  foundingOffer: boolean;
  canManageBilling: boolean;
  initialInterval?: BillingInterval;
}) {
  const [tier, setTier] = useState<SellerTierId>(plans.find((plan) => plan.popular)?.id ?? plans[0]?.id ?? "TIER_3");
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);
  const [promotionCode, setPromotionCode] = useState("");
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setPending("checkout");
    setError(null);
    try {
      const res = await fetch("/api/sellers/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval, promotionCode }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function manageBilling() {
    setPending("portal");
    setError(null);
    try {
      const res = await fetch("/api/sellers/billing/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not open billing.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className={interval === "month" ? "btn-primary" : "btn-secondary"}
          onClick={() => setInterval("month")}
        >
          Monthly
        </button>
        <button
          type="button"
          className={interval === "year" ? "btn-primary" : "btn-secondary"}
          onClick={() => setInterval("year")}
        >
          Annual
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {plans.map((plan) => {
          const cents = interval === "year" ? planAnnualPriceCents(plan.id) : plan.monthlyPriceCents;
          const selected = tier === plan.id;
          return (
            <label
              key={plan.id}
              className={`flex cursor-pointer items-start gap-3 border px-4 py-3 ${
                selected ? "border-[var(--rg-core)] bg-[var(--panel2)]" : "border-[var(--border)]"
              }`}
            >
              <input
                type="radio"
                name="billing-tier"
                value={plan.id}
                checked={selected}
                onChange={() => setTier(plan.id)}
                className="mt-1 accent-[var(--rg-core)]"
              />
              <span className="flex-1">
                <span className="block text-sm text-[var(--cream)]">
                  {plan.tierLabel} · {plan.name}
                  {plan.popular ? " · Most popular" : ""}
                </span>
                <span className="mt-1 block text-[0.78rem] font-light text-[var(--muted2)]">{plan.pickerSummary}</span>
              </span>
              <span className="text-sm text-[var(--rg-light)]">
                {formatTierPrice(cents)}
                {interval === "year" ? "/yr" : "/mo"}
              </span>
            </label>
          );
        })}
      </div>
      <label className="mt-4 block text-[0.65rem] font-medium tracking-[0.13em] text-[var(--muted)] uppercase">
        Founding Artist code
        <input
          value={promotionCode}
          onChange={(event) => setPromotionCode(event.target.value)}
          placeholder="FOUNDING50"
          className="mt-2 w-full border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm tracking-normal text-[var(--cream)] normal-case"
        />
      </label>
      <p className="mt-2 text-[0.78rem] font-light text-[var(--muted2)]">
        {foundingOffer
          ? "An admin has marked your shop for the Founding Artist offer: 90 days free, then 50% off for 9 months."
          : "Enter FOUNDING50 if you have it. The first 50 sellers get 90 days free, then 50% off for 9 months. Everyone else gets a 7-day trial."}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={startCheckout} disabled={pending !== null}>
          {pending === "checkout" ? "Redirecting to Stripe…" : "Start free trial"}
        </button>
        {canManageBilling && (
          <button type="button" className="btn-secondary" onClick={manageBilling} disabled={pending !== null}>
            {pending === "portal" ? "Opening…" : "Manage billing"}
          </button>
        )}
        {error && <span className="text-[0.78rem] text-[#e58a8a]">{error}</span>}
      </div>
    </div>
  );
}
