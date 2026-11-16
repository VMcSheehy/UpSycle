// Single source of truth for public seller-plan prices and marketing features.
// Homepage banner, signup tier picker, seller FAQ, and /sell all read this
// file. Monthly cents match prisma/seed.ts and the tier_plans migration
// (3999 / 2999 / 1999). Paid Highlighted Artist slot prices live in
// lib/placement.ts and are not repeated here.
//
// This is marketing copy only. The 7-day trial, listing caps, badges,
// lottery odds, and analytics are not enforced in billing or the product
// yet.

export const TRIAL_DAYS = 7;

export type SellerTierId = "TIER_1" | "TIER_2" | "TIER_3";

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
  /** Short label used in admin and forms, e.g. "Tier 1". */
  tierLabel: string;
  /** Buyer-facing badge name, e.g. "Top Artist". */
  name: string;
  /** Monthly price in cents. Same figures as the tier_plans seed. */
  monthlyPriceCents: number;
  /** Who the plan is for, shown on the plan card. */
  audience: string;
  popular: boolean;
  /** One line for the application plan picker. */
  pickerSummary: string;
  /** Bullets on the /sell plan card, in display order. */
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
      "Monthly newsletter and social feature",
      "Up to 5 photos per product",
      "Full sales and traffic analytics",
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
    monthlyPriceCents: 2999,
    audience: "For growing sellers ready to be discovered on category pages.",
    popular: true,
    pickerSummary: "Most popular. Category featured spots, up to 50 listings, newsletter rotation.",
    highlights: [
      "Featured on category pages",
      "Medium weekly spotlight lottery odds",
      "Up to 50 listings",
      "Up to 20 products on the shop page",
      "Ranked above Tier 3 in search",
      "Featured Artist badge",
      "Rotation in the newsletter",
      "Up to 3 photos per product",
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
    monthlyPriceCents: 1999,
    audience: "For new or small sellers, about $0 to $500 a month.",
    popular: false,
    pickerSummary: "A standard shop, a lottery entry, and the option to buy highlight spots.",
    highlights: [
      "A standard shop page",
      "An entry in the weekly spotlight lottery",
      "Up to 15 listings",
      "Up to 12 products on the shop page",
      "Up to 2 photos per product",
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

export const SELLER_APPLY_PATH = "/sell/signup";

const PLAN_BY_ID = new Map(SELLER_PLANS.map((plan) => [plan.id, plan]));

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

/** Lowest monthly plan — the "plans from" price on the homepage banner. */
export function startingPlan(): SellerPlan {
  return SELLER_PLANS.reduce((lowest, plan) =>
    plan.monthlyPriceCents < lowest.monthlyPriceCents ? plan : lowest,
  );
}

export function formatTierPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function sellerApplyHref(planId?: SellerTierId): string {
  if (!planId) return SELLER_APPLY_PATH;
  return `${SELLER_APPLY_PATH}?plan=${planId}`;
}

export interface SellerFaqItem {
  question: string;
  answer: string;
}

/** Seller FAQ copy. Prices and the trial length are filled from this file. */
export function sellerFaqItems(): SellerFaqItem[] {
  const fromPrice = formatTierPrice(startingPlan().monthlyPriceCents);
  return [
    {
      question: "Can I change plans later?",
      answer:
        "Yes. Upgrade any time from your dashboard. A downgrade takes effect on your next billing date.",
    },
    {
      question: "Do buyers see what I pay?",
      answer: `No. Buyers only see your badge and where your work is featured — never your monthly plan price. The homepage shows a short “plans from ${fromPrice}/mo” note for makers, not a full price table.`,
    },
    {
      question: "When am I charged?",
      answer: `After the ${TRIAL_DAYS}-day trial, then monthly. You can cancel before the trial ends and you won’t be billed.`,
    },
  ];
}
