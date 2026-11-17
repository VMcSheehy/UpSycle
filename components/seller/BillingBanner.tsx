import Link from "next/link";
import { billingBanner, billingGraceDays, type SellerBillingRecord } from "@/lib/seller-billing";
import { formatTierPrice, planById, priceCentsForInterval, type SellerTierId } from "@/lib/tiers";

export default function BillingBanner({
  record,
}: {
  record: SellerBillingRecord | null;
}) {
  const banner = billingBanner(record, new Date(), billingGraceDays());
  if (!banner) return null;
  const tone =
    banner.tone === "warning"
      ? "border-[#e0b15a] bg-[rgba(224,177,90,0.08)] text-[#f0d7a2]"
      : "border-[var(--border)] bg-[var(--charcoal)] text-[var(--muted2)]";
  return (
    <div className={`mb-8 border px-5 py-4 text-[0.9rem] font-light leading-relaxed ${tone}`}>
      <p>{banner.message}</p>
      <Link href="/sell/billing" className="mt-2 inline-block text-[var(--rg-light)] underline">
        Review billing
      </Link>
    </div>
  );
}

export function currentPlanSummary(record: SellerBillingRecord | null): string {
  if (!record) return "No plan yet";
  const plan = planById(record.tier as SellerTierId);
  const cents =
    record.billingInterval === "year" || record.billingInterval === "month"
      ? priceCentsForInterval(plan.id, record.billingInterval)
      : plan.monthlyPriceCents;
  const cadence = record.billingInterval === "year" ? "/yr" : "/mo";
  return `${plan.tierLabel} · ${plan.name} · ${formatTierPrice(cents)}${record.status === "COMPED" ? "" : cadence} · ${record.status.toLowerCase().replace("_", " ")}`;
}
