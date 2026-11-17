import { describe, expect, it } from "vitest";
import {
  applyBillingEvent,
  assertTestModeSecretKey,
  billingBanner,
  evaluateFoundingEligibility,
  foundingCouponSchedule,
  sellerListingsArePublic,
  sellerSubscriptionCheckoutParams,
  tierFromStripePrice,
  type BillingState,
  type SellerBillingRecord,
  type SubscriptionSnapshot,
} from "@/lib/seller-billing";
import {
  addonLookupKeys,
  annualPriceCents,
  FOUNDING_OFFER,
  planAnnualPriceCents,
  planById,
  sellerPlanLookupKey,
} from "@/lib/tiers";

const NOW = new Date("2026-06-15T00:00:00.000Z");

function snapshot(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    sellerProfileId: "seller-1",
    subscriptionId: "sub_1",
    customerId: "cus_1",
    stripeStatus: "trialing",
    deleted: false,
    lookupKey: "upsycle_tier2_monthly",
    metadataTier: "TIER_1",
    priceId: "price_current",
    interval: "month",
    currentPeriodEnd: new Date("2026-07-15T00:00:00.000Z"),
    trialEnd: new Date("2026-06-22T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    foundingArtist: false,
    couponOnSubscription: false,
    ...overrides,
  };
}

function state(record: SellerBillingRecord | null = null): BillingState {
  return { record, processedEventIds: [] };
}

describe("seller plan prices", () => {
  it("uses the approved monthly prices and 10x annual prices", () => {
    expect(planById("TIER_1").monthlyPriceCents).toBe(3999);
    expect(planById("TIER_2").monthlyPriceCents).toBe(2499);
    expect(planById("TIER_3").monthlyPriceCents).toBe(1499);
    expect(planAnnualPriceCents("TIER_1")).toBe(39990);
    expect(planAnnualPriceCents("TIER_2")).toBe(24990);
    expect(planAnnualPriceCents("TIER_3")).toBe(14990);
    expect(annualPriceCents(1499)).toBe(14990);
  });

  it("builds Stripe lookup keys for plans and future tiered add-ons", () => {
    expect(sellerPlanLookupKey("TIER_1", "month")).toBe("upsycle_tier1_monthly");
    expect(sellerPlanLookupKey("TIER_3", "year")).toBe("upsycle_tier3_annual");
    expect(addonLookupKeys("highlight_home")).toEqual({
      TIER_1: "upsycle_addon_highlight_home_t1",
      TIER_2: "upsycle_addon_highlight_home_t2",
      TIER_3: "upsycle_addon_highlight_home_t3",
    });
  });
});

describe("webhook to seller record", () => {
  it("sets the tier from the price lookup key and ignores metadata", () => {
    expect(tierFromStripePrice("upsycle_tier3_annual", "TIER_1")).toBe("TIER_3");
    expect(tierFromStripePrice(null, "TIER_1")).toBeNull();

    const result = applyBillingEvent(
      state(),
      { kind: "subscription", eventId: "evt_1", snapshot: snapshot({ metadataTier: "TIER_1", lookupKey: "upsycle_tier3_monthly" }) },
      NOW,
    );
    expect(result.applied).toBe(true);
    expect(result.state.record?.tier).toBe("TIER_3");
    expect(result.state.record?.status).toBe("TRIALING");
    expect(result.state.record?.stripeCustomerId).toBe("cus_1");
    expect(result.state.record?.stripeSubscriptionId).toBe("sub_1");
    expect(result.state.record?.trialEnd?.toISOString()).toBe("2026-06-22T00:00:00.000Z");
    expect(result.state.record?.currentPeriodEnd?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("does not change the tier when the lookup key is unknown", () => {
    const current = applyBillingEvent(
      state(),
      { kind: "subscription", eventId: "evt_1", snapshot: snapshot() },
      NOW,
    ).state;
    const again = applyBillingEvent(
      current,
      {
        kind: "subscription",
        eventId: "evt_2",
        snapshot: snapshot({ lookupKey: "price_old_without_key", metadataTier: "TIER_1", stripeStatus: "active" }),
      },
      NOW,
    );
    expect(again.state.record?.tier).toBe("TIER_2");
    expect(again.state.record?.status).toBe("ACTIVE");
  });

  it("marks a failed invoice past due and a paid invoice active again", () => {
    const active = applyBillingEvent(
      state(),
      { kind: "subscription", eventId: "evt_1", snapshot: snapshot({ stripeStatus: "active" }) },
      NOW,
    ).state;
    const failed = applyBillingEvent(
      active,
      { kind: "invoice_payment_failed", eventId: "evt_2", sellerProfileId: "seller-1" },
      NOW,
    );
    expect(failed.state.record?.status).toBe("PAST_DUE");
    expect(failed.state.record?.delinquentSince).toEqual(NOW);

    const later = new Date("2026-06-20T00:00:00.000Z");
    const stillDue = applyBillingEvent(
      failed.state,
      { kind: "invoice_payment_failed", eventId: "evt_3", sellerProfileId: "seller-1" },
      later,
    );
    expect(stillDue.state.record?.delinquentSince).toEqual(NOW);

    const paid = applyBillingEvent(
      stillDue.state,
      { kind: "invoice_paid", eventId: "evt_4", sellerProfileId: "seller-1" },
      later,
    );
    expect(paid.state.record?.status).toBe("ACTIVE");
    expect(paid.state.record?.delinquentSince).toBeNull();
  });

  it("records founding for reporting and asks to schedule the coupon after the trial starts", () => {
    const result = applyBillingEvent(
      state(),
      {
        kind: "subscription",
        eventId: "evt_1",
        snapshot: snapshot({
          foundingArtist: true,
          trialEnd: new Date("2026-09-13T00:00:00.000Z"),
        }),
      },
      NOW,
    );
    expect(result.state.record?.foundingArtist).toBe(true);
    expect(result.scheduleFoundingCoupon).toBe(true);
    const repeat = applyBillingEvent(
      { record: { ...result.state.record!, foundingCouponScheduled: true }, processedEventIds: [] },
      { kind: "subscription", eventId: "evt_2", snapshot: snapshot({ foundingArtist: true, stripeStatus: "trialing" }) },
      NOW,
    );
    expect(repeat.scheduleFoundingCoupon).toBe(false);
    expect(repeat.state.record?.foundingArtist).toBe(true);
  });

  it("ignores a repeated event id", () => {
    const first = applyBillingEvent(state(), { kind: "subscription", eventId: "evt_1", snapshot: snapshot() }, NOW);
    const second = applyBillingEvent(
      first.state,
      { kind: "subscription", eventId: "evt_1", snapshot: snapshot({ lookupKey: "upsycle_tier1_monthly", stripeStatus: "active" }) },
      NOW,
    );
    expect(second.duplicate).toBe(true);
    expect(second.state.record?.tier).toBe("TIER_2");
    expect(second.state.record?.status).toBe("TRIALING");
  });

  it("does not mark an event done when the seller cannot be resolved", () => {
    const result = applyBillingEvent(
      state(),
      { kind: "subscription", eventId: "evt_1", snapshot: snapshot({ sellerProfileId: null }) },
      NOW,
    );
    expect(result.applied).toBe(false);
    expect(result.state.processedEventIds).toEqual([]);
  });
});

describe("listing grace period", () => {
  const seller = (status: string, delinquentSince: Date | null) => ({
    approvalStatus: "APPROVED",
    subscription: { status, delinquentSince },
  });

  it("shows active, trialing, and comped shops and hides a missing subscription", () => {
    expect(sellerListingsArePublic(seller("ACTIVE", null), NOW)).toBe(true);
    expect(sellerListingsArePublic(seller("TRIALING", null), NOW)).toBe(true);
    expect(sellerListingsArePublic(seller("COMPED", null), NOW)).toBe(true);
    expect(sellerListingsArePublic({ approvalStatus: "APPROVED", subscription: null }, NOW)).toBe(false);
    expect(sellerListingsArePublic({ approvalStatus: "PENDING", subscription: { status: "ACTIVE", delinquentSince: null } }, NOW)).toBe(false);
  });

  it("hides past-due and canceled shops after the grace period", () => {
    const within = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
    const after = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000);
    expect(sellerListingsArePublic(seller("PAST_DUE", within), NOW, 7)).toBe(true);
    expect(sellerListingsArePublic(seller("CANCELED", after), NOW, 7)).toBe(false);
    expect(sellerListingsArePublic(seller("UNPAID", null), NOW, 7)).toBe(false);
    expect(billingBanner(null, NOW)?.message).toMatch(/7-day free trial/);
  });
});

describe("founding checkout", () => {
  it("gives founders 90 days and everyone else 7, and does not send a coupon or payment method list", () => {
    const founder = sellerSubscriptionCheckoutParams({
      priceId: "price_1",
      sellerProfileId: "seller-1",
      customerId: null,
      customerEmail: "maker@example.com",
      founder: true,
      siteUrl: "https://upsycle.example",
      integrationSuffix: "abcdefgh",
    });
    expect(founder.mode).toBe("subscription");
    expect(founder.subscription_data?.trial_period_days).toBe(90);
    expect(founder.subscription_data?.metadata?.founding_artist).toBe("true");
    expect(founder.discounts).toBeUndefined();
    expect(founder.allow_promotion_codes).toBe(true);
    expect(founder.integration_identifier).toBe("upsycle_seller_subscription_abcdefgh");
    expect(founder).not.toHaveProperty("payment_method_types");
    expect(founder).not.toHaveProperty("automatic_tax");

    const regular = sellerSubscriptionCheckoutParams({
      priceId: "price_1",
      sellerProfileId: "seller-1",
      customerId: "cus_1",
      customerEmail: "maker@example.com",
      founder: false,
      siteUrl: "https://upsycle.example",
      integrationSuffix: "abcdefgh",
    });
    expect(regular.subscription_data?.trial_period_days).toBe(7);
    expect(regular.subscription_data?.metadata?.founding_artist).toBeUndefined();
    expect(regular.customer).toBe("cus_1");
    expect(regular.customer_email).toBeUndefined();
  });

  it("schedules 9 months at 50% off after the free trial, then the current price", () => {
    const phases = foundingCouponSchedule({
      priceId: "price_locked_for_this_term",
      phaseStart: 1_000,
      trialEnd: 2_000,
    });
    expect(phases).toEqual([
      {
        priceId: "price_locked_for_this_term",
        startDate: 1_000,
        endDate: 2_000,
        trialEnd: 2_000,
        clearDiscounts: true,
      },
      {
        priceId: "price_locked_for_this_term",
        durationMonths: 9,
        couponId: "founding_artist_50off_9mo",
      },
      { priceId: "price_locked_for_this_term", clearDiscounts: true },
    ]);
    expect(FOUNDING_OFFER.trialDays).toBe(90);
    expect(FOUNDING_OFFER.maxRedemptions).toBe(50);
    expect(FOUNDING_OFFER.percentOff).toBe(50);
    expect(FOUNDING_OFFER.promoCode).toBe("FOUNDING50");
  });

  it("accepts the promo code or an admin flag until 50 sellers, and keeps an existing claim", () => {
    expect(evaluateFoundingEligibility({ promotionCode: "founding50", adminFlag: false, slotsUsedByOthers: 49, alreadyClaimed: false })).toEqual({ founder: true });
    expect(evaluateFoundingEligibility({ promotionCode: null, adminFlag: true, slotsUsedByOthers: 0, alreadyClaimed: false })).toEqual({ founder: true });
    expect(evaluateFoundingEligibility({ promotionCode: null, adminFlag: false, slotsUsedByOthers: 0, alreadyClaimed: false })).toEqual({ founder: false });
    expect(evaluateFoundingEligibility({ promotionCode: "FOUNDING50", adminFlag: false, slotsUsedByOthers: 50, alreadyClaimed: false })).toEqual({
      error: "The Founding Artist offer is full. The first 50 sellers have already claimed it.",
    });
    expect(evaluateFoundingEligibility({ promotionCode: null, adminFlag: false, slotsUsedByOthers: 50, alreadyClaimed: true })).toEqual({ founder: true });
  });
});

describe("stripe-setup key guard", () => {
  it("refuses live keys and accepts test keys", () => {
    expect(() => assertTestModeSecretKey("sk_live_123")).toThrow(/live/i);
    expect(() => assertTestModeSecretKey("rk_live_123")).toThrow(/live/i);
    expect(() => assertTestModeSecretKey("sk_test_123")).not.toThrow();
    expect(() => assertTestModeSecretKey("rk_test_123")).not.toThrow();
    expect(() => assertTestModeSecretKey(undefined)).toThrow(/not set/i);
  });
});
