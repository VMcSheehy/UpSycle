"use client";

import { useState } from "react";
import type { SellerTier } from "@prisma/client";
import { SELLER_PLANS, formatTierPrice, planById, type SellerTierId } from "@/lib/tiers";

const labelClass =
  "mb-2 block text-[0.65rem] font-medium tracking-[0.13em] uppercase text-[var(--muted)]";

function tierLabel(tier: SellerTier): string {
  return planById(tier as SellerTierId).tierLabel;
}

export default function TierSelector({ initialTier }: { initialTier: SellerTier }) {
  const [tier, setTier] = useState<SellerTier>(initialTier);
  const [saved, setSaved] = useState<SellerTier>(initialTier);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/sellers/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.errors?.[0] ?? "Failed to save your tier.");
        return;
      }
      setSaved(data.tier ?? tier);
      setSuccess(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <label className={labelClass}>Seller Tier</label>
      <p className="mb-2 text-[0.78rem] font-light text-[var(--muted2)]">
        Current Tier: <span className="text-[var(--cream)]">{tierLabel(saved)}</span>
      </p>

      <div className="mt-4 space-y-3">
        {SELLER_PLANS.map((plan) => (
          <label
            key={plan.id}
            className="flex cursor-pointer items-center gap-3 border border-[var(--border)] bg-[var(--panel2)] px-4 py-3 text-sm text-[var(--cream)] transition-colors has-[:checked]:border-[var(--rg-core)]"
          >
            <input
              type="radio"
              name="seller-tier"
              value={plan.id}
              checked={tier === plan.id}
              onChange={() => {
                setTier(plan.id);
                setSuccess(false);
              }}
            />
            <span className="flex-1">
              {plan.tierLabel} · {plan.name}
              {plan.popular ? " · Most popular" : ""}
            </span>
            <span className="text-[var(--muted2)]">{formatTierPrice(plan.monthlyPriceCents)}/mo</span>
          </label>
        ))}
      </div>

      <p className="mt-4 text-[0.75rem] font-light italic text-[var(--muted2)]">
        Changing your tier here has no billing effect yet. The free trial and plan features are
        not enforced.
      </p>

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleSave}
          disabled={pending || tier === saved}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {success && <span className="text-[0.75rem] text-[var(--success)]">Saved.</span>}
        {error && <span className="text-[0.75rem] text-[#e58a8a]">{error}</span>}
      </div>
    </div>
  );
}
