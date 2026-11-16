// Public seller-tier prices. Kept in one place so the homepage, signup form,
// shop settings, and FAQ cannot drift. Benefit columns on TierPlan are not
// fully specified for every tier, so public copy stays neutral.

export type PublicSellerTier = "TIER_1" | "TIER_2" | "TIER_3";

export const SELLER_TIER_OPTIONS: {
  value: PublicSellerTier;
  label: string;
  monthlyPrice: string;
}[] = [
  { value: "TIER_1", label: "Tier 1", monthlyPrice: "$39.99" },
  { value: "TIER_2", label: "Tier 2", monthlyPrice: "$29.99" },
  { value: "TIER_3", label: "Tier 3", monthlyPrice: "$19.99" },
];

export const SELLER_TIER_VISIBILITY_COPY =
  "Higher tiers get more visibility in search and featured placements.";
