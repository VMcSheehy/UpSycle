import type { SellerTier } from "@prisma/client";

import { sellerTierLabel } from "@/lib/format";
import { SUPPORT_EMAIL } from "@/lib/support-email";

const labelClass =
  "mb-2 block text-[0.65rem] font-medium tracking-[0.13em] uppercase text-[var(--muted)]";

// Read-only. Sellers cannot change their own tier from shop settings.
// An admin, or a future billing flow, is the only writer.
export default function TierSelector({ initialTier }: { initialTier: SellerTier }) {
  return (
    <div>
      <p className={labelClass}>Seller tier</p>
      <p className="text-[0.95rem] font-light text-[var(--cream)]">
        Current tier: <span className="text-[var(--rg-light)]">{sellerTierLabel(initialTier)}</span>
      </p>
      <p className="mt-3 text-[0.85rem] font-light leading-relaxed text-[var(--muted2)]">
        Contact us to change. Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--rg-light)] underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
