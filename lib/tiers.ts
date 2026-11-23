// Single source of truth for seller plan prices. Signup, the seller
// dashboard, Stripe lookup keys, and the seed all read this file.
//
// Launch prices: Tier 1 $39.99/mo, Tier 2 $24.99/mo, Tier 3 $14.99/mo.
// Annual prices are 10x the monthly price (two months included).
//
// Add-on checkout is not in this release. Lookup keys are shaped so a later
// add-on can bill a different price for each tier.

export const TRIAL_DAYS = 7;

export const ANNUAL_MONTHS_BILLED = 10;

export type SellerTierId = "TIER_1" | "TIER_2" | "TIER_3";

export type BillingInterval = "month" | "year";

export interface PlanComparison {
  listings: string;
  shopProducts: string;
  photos: string;
  lottery: string;
  placement: string;
  search: string;
  badge: string;
  newsletter: string;
  analytics: string;
  paidHighlights: string;
}

export interface SellerPlan {
  id: SellerTierId;
  tierLabel: string;
  name: string;
  /** Monthly price in cents. */
  monthlyPriceCents: number;
  audience: string;
  popular: boolean;
  pickerSummary: string;
  highlights: string[];
  comparison: PlanComparison;
}

export const SELLER_PLANS: SellerPlan[] = [
  {
    id: "TIER_1",
    tierLabel: "Tier 1",
    name: "Top Artist",
    monthlyPriceCents: 3999,
    audience: "For established sellers, about $2,000+ a month in sales.",
    popular: false,
    pickerSummary: "Homepage featured placement, best lottery odds, unlimited listings.",
    highlights: [
      "Featured on the homepage",
      "Best weekly spotlight lottery odds",
      "Unlimited listings",
      "Up to 30 products on the shop page",
      "Top search ranking",
      "Top Artist badge",
    ],
    comparison: {
      listings: "Unlimited",
      shopProducts: "Up to 30",
      photos: "Up to 5",
      lottery: "Best odds",
      placement: "Homepage",
      search: "Highest",
      badge: "Top Artist",
      newsletter: "Monthly feature",
      analytics: "Full sales & traffic",
      paidHighlights: "Optional",
    },
  },
  {
    id: "TIER_2",
    tierLabel: "Tier 2",
    name: "Featured Artist",
    monthlyPriceCents: 2499,
    audience: "For growing sellers ready to be discovered on category pages.",
    popular: true,
    pickerSummary: "Most popular. Category featured spots and up to 50 listings.",
    highlights: [
      "Featured on category pages",
      "Medium weekly spotlight lottery odds",
      "Up to 50 listings",
      "Up to 20 products on the shop page",
      "Featured Artist badge",
      "Basic sales stats",
    ],
    comparison: {
      listings: "Up to 50",
      shopProducts: "Up to 20",
      photos: "Up to 3",
      lottery: "Medium odds",
      placement: "Category pages",
      search: "Above Tier 3",
      badge: "Featured Artist",
      newsletter: "Rotation",
      analytics: "Basic stats",
      paidHighlights: "Optional",
    },
  },
  {
    id: "TIER_3",
    tierLabel: "Tier 3",
    name: "Artist",
    monthlyPriceCents: 1499,
    audience: "For new or small sellers, about $0 to $500 a month.",
    popular: false,
    pickerSummary: "A standard shop, a lottery entry, and the option to buy highlight spots.",
    highlights: [
      "A standard shop page",
      "An entry in the weekly spotlight lottery",
      "Up to 15 listings",
      "Up to 12 products on the shop page",
      "Buy paid highlight spots anytime",
    ],
    comparison: {
      listings: "Up to 15",
      shopProducts: "Up to 12",
      photos: "Up to 2",
      lottery: "Standard entry",
      placement: "—",
      search: "Standard",
      badge: "—",
      newsletter: "—",
      analytics: "—",
      paidHighlights: "Available",
    },
  },
];

export const COMPARISON_ROWS: { key: keyof PlanComparison; label: string }[] = [
  { key: "listings", label: "Listings" },
  { key: "shopProducts", label: "Products on shop page" },
  { key: "photos", label: "Photos per product" },
  { key: "lottery", label: "Weekly spotlight lottery" },
  { key: "placement", label: "Featured placement" },
  { key: "search", label: "Search ranking" },
  { key: "badge", label: "Badge on shop & products" },
  { key: "newsletter", label: "Newsletter & social" },
  { key: "analytics", label: "Analytics" },
  { key: "paidHighlights", label: "Paid highlight spots" },
];

/** Stripe product tax code: General - Services. Not tangible goods (txcd_99999999). */
export const SELLER_PLAN_TAX_CODE = "txcd_20030000";

export const SELLER_PLAN_TAX_CODE_NAME = "General - Services";

/**
 * Founding Artist: 90 days free, then 50% off for 9 months, then full price.
 * The coupon is attached after the free period, not during it. There is no
 * lifetime price lock. The cap is 50 sellers.
 */
export const FOUNDING_OFFER = {
  promoCode: "FOUNDING50",
  couponId: "founding_artist_50off_9mo",
  percentOff: 50,
  duration: "repeating" as const,
  durationInMonths: 9,
  maxRedemptions: 50,
  trialDays: 90,
  metadataKey: "founding_artist",
  metadataValue: "true",
};

export const FOUNDING_CLAIM_HOLD_MS = 24 * 60 * 60 * 1000;

export const ADDON_LOOKUP_PREFIX = "upsycle_addon";

const PLAN_BY_ID = new Map(SELLER_PLANS.map((plan) => [plan.id, plan]));

const TIER_NUMBER: Record<SellerTierId, 1 | 2 | 3> = {
  TIER_1: 1,
  TIER_2: 2,
  TIER_3: 3,
};

const TIER_SUFFIX: Record<SellerTierId, "t1" | "t2" | "t3"> = {
  TIER_1: "t1",
  TIER_2: "t2",
  TIER_3: "t3",
};

export function isSellerTierId(value: string | undefined | null): value is SellerTierId {
  return value === "TIER_1" || value === "TIER_2" || value === "TIER_3";
}

export function planById(id: SellerTierId): SellerPlan {
  const plan = PLAN_BY_ID.get(id);
  if (!plan) {
    throw new Error(`Unknown seller plan ${id}`);
  }
  return plan;
}

export function annualPriceCents(monthlyPriceCents: number): number {
  return monthlyPriceCents * ANNUAL_MONTHS_BILLED;
}

export function planAnnualPriceCents(id: SellerTierId): number {
  return annualPriceCents(planById(id).monthlyPriceCents);
}

export function priceCentsForInterval(id: SellerTierId, interval: BillingInterval): number {
  return interval === "year" ? planAnnualPriceCents(id) : planById(id).monthlyPriceCents;
}

/** Lowest monthly plan. The "plans from" price. */
export function startingPlan(): SellerPlan {
  return SELLER_PLANS.reduce((lowest, plan) =>
    plan.monthlyPriceCents < lowest.monthlyPriceCents ? plan : lowest,
  );
}

export function formatTierPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function sellerPlanLookupKey(id: SellerTierId, interval: BillingInterval): string {
  const n = TIER_NUMBER[id];
  return interval === "year" ? `upsycle_tier${n}_annual` : `upsycle_tier${n}_monthly`;
}

export function tierFromLookupKey(lookupKey: string | null | undefined): SellerTierId | null {
  if (!lookupKey) return null;
  if (lookupKey === "upsycle_tier1_monthly" || lookupKey === "upsycle_tier1_annual") return "TIER_1";
  if (lookupKey === "upsycle_tier2_monthly" || lookupKey === "upsycle_tier2_annual") return "TIER_2";
  if (lookupKey === "upsycle_tier3_monthly" || lookupKey === "upsycle_tier3_annual") return "TIER_3";
  return null;
}

export function intervalFromLookupKey(lookupKey: string | null | undefined): BillingInterval | null {
  if (!lookupKey) return null;
  if (lookupKey.endsWith("_annual")) return "year";
  if (lookupKey.endsWith("_monthly")) return "month";
  return null;
}

/**
 * Future add-on prices, one Stripe Price per seller tier. Not created or
 * charged in this release. Example: upsycle_addon_highlight_home_t1.
 */
export function addonLookupKey(addonName: string, tier: SellerTierId): string {
  const slug = addonName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!slug) {
    throw new Error("Add-on name is required.");
  }
  return `${ADDON_LOOKUP_PREFIX}_${slug}_${TIER_SUFFIX[tier]}`;
}

export function addonLookupKeys(addonName: string): Record<SellerTierId, string> {
  return {
    TIER_1: addonLookupKey(addonName, "TIER_1"),
    TIER_2: addonLookupKey(addonName, "TIER_2"),
    TIER_3: addonLookupKey(addonName, "TIER_3"),
  };
}

export function isFoundingPromoCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.trim().toUpperCase() === FOUNDING_OFFER.promoCode;
}

export const SELLER_APPLY_PATH = "/sell/signup";

export function sellerApplyHref(planId?: SellerTierId): string {
  if (!planId) return SELLER_APPLY_PATH;
  return `${SELLER_APPLY_PATH}?plan=${planId}`;
}
