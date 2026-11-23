-- Seller subscription billing: trial end, Stripe price, founding offer, and
-- webhook idempotency. Tier and subscription status are still written by the
-- app from Stripe webhooks, not from this migration.

-- New enum values are not used in this file. Postgres can add them inside
-- the migration transaction and the app can use them after it commits.
ALTER TYPE "SellerSubscriptionStatus" ADD VALUE 'TRIALING';
ALTER TYPE "SellerSubscriptionStatus" ADD VALUE 'UNPAID';

ALTER TABLE "seller_subscriptions" ADD COLUMN "stripePriceId" TEXT;
ALTER TABLE "seller_subscriptions" ADD COLUMN "billingInterval" TEXT;
ALTER TABLE "seller_subscriptions" ADD COLUMN "trialEnd" TIMESTAMP(3);
ALTER TABLE "seller_subscriptions" ADD COLUMN "foundingArtist" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "seller_subscriptions" ADD COLUMN "foundingCouponScheduled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "seller_subscriptions" ADD COLUMN "delinquentSince" TIMESTAMP(3);

CREATE UNIQUE INDEX "seller_subscriptions_stripeCustomerId_key" ON "seller_subscriptions"("stripeCustomerId");

ALTER TABLE "seller_profiles" ADD COLUMN "requestedTier" "SellerTier";
ALTER TABLE "seller_profiles" ADD COLUMN "foundingOffer" BOOLEAN NOT NULL DEFAULT false;

-- Keep the plan someone already applied under. This is not the billed tier.
UPDATE "seller_profiles" SET "requestedTier" = "tier" WHERE "requestedTier" IS NULL;

-- Approved launch prices. Tier 1 was already $39.99. Tier 2 and Tier 3 change.
UPDATE "tier_plans"
SET "name" = 'Top Artist', "monthlyPriceCents" = 3999, "updatedAt" = CURRENT_TIMESTAMP
WHERE "tier" = 'TIER_1';

UPDATE "tier_plans"
SET "name" = 'Featured Artist', "monthlyPriceCents" = 2499, "updatedAt" = CURRENT_TIMESTAMP
WHERE "tier" = 'TIER_2';

UPDATE "tier_plans"
SET "name" = 'Artist', "monthlyPriceCents" = 1499, "updatedAt" = CURRENT_TIMESTAMP
WHERE "tier" = 'TIER_3';

CREATE TYPE "FoundingOfferStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RELEASED');

CREATE TABLE "founding_offer_claims" (
    "id" TEXT NOT NULL,
    "sellerProfileId" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "status" "FoundingOfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founding_offer_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "founding_offer_claims_sellerProfileId_key" ON "founding_offer_claims"("sellerProfileId");
CREATE UNIQUE INDEX "founding_offer_claims_stripeCheckoutSessionId_key" ON "founding_offer_claims"("stripeCheckoutSessionId");
CREATE INDEX "founding_offer_claims_status_idx" ON "founding_offer_claims"("status");

ALTER TABLE "founding_offer_claims" ADD CONSTRAINT "founding_offer_claims_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "seller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "processed_stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("id")
);
