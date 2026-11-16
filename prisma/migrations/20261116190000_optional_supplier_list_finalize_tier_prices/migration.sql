-- Seller applications no longer collect a supplier list. Keep the column so
-- existing answers are not deleted. The original migration created this
-- column without NOT NULL, so it is already nullable. This only adds an
-- empty-array default for new rows that omit the field.
ALTER TABLE "seller_profiles" ALTER COLUMN "supplierList" SET DEFAULT ARRAY[]::TEXT[];

-- Public monthly prices are final for every tier (Tier 1 $39.99, Tier 2
-- $29.99, Tier 3 $19.99). Benefit columns are intentionally left unchanged.
UPDATE "tier_plans"
SET "isPricingFinalized" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "isPricingFinalized" = false;
