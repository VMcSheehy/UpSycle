// Pure seller-billing rules. Webhook routes and Checkout build Stripe calls
// from these decisions. Nothing here reads the request body as the seller's
// tier or subscription status.

import type { SellerSubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";
import {
  FOUNDING_OFFER,
  type BillingInterval,
  type SellerTierId,
  tierFromLookupKey,
} from "@/lib/tiers";

export interface SellerBillingRecord {
  sellerProfileId: string;
  tier: SellerTierId;
  status: SellerSubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  billingInterval: BillingInterval | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  foundingArtist: boolean;
  foundingCouponScheduled: boolean;
  delinquentSince: Date | null;
}

export interface SubscriptionSnapshot {
  sellerProfileId: string | null;
  subscriptionId: string;
  customerId: string | null;
  /** Raw Stripe subscription status, such as "trialing". */
  stripeStatus: string;
  deleted: boolean;
  lookupKey: string | null;
  /** Ignored. A client or metadata tier never wins over the Price lookup key. */
  metadataTier: string | null;
  priceId: string | null;
  interval: BillingInterval | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  foundingArtist: boolean;
  couponOnSubscription: boolean;
}

export type BillingSignal =
  | { kind: "subscription"; eventId: string; snapshot: SubscriptionSnapshot }
  | { kind: "invoice_paid"; eventId: string; sellerProfileId: string }
  | { kind: "invoice_payment_failed"; eventId: string; sellerProfileId: string };

export interface BillingState {
  record: SellerBillingRecord | null;
  processedEventIds: string[];
}

export interface BillingApplyResult {
  state: BillingState;
  duplicate: boolean;
  /** False when the seller or the Price could not be resolved. Do not mark the event done. */
  applied: boolean;
  tierChanged: boolean;
  /** Attach the 9-month coupon on a schedule that starts when the trial ends. */
  scheduleFoundingCoupon: boolean;
}

export const GRACE_LISTING_STATUSES = ["PAST_DUE", "UNPAID", "CANCELED"] as const satisfies readonly SellerSubscriptionStatus[];

export const GOOD_LISTING_STATUSES = ["ACTIVE", "TRIALING", "COMPED"] as const satisfies readonly SellerSubscriptionStatus[];

const GRACE_STATUSES: ReadonlySet<string> = new Set(GRACE_LISTING_STATUSES);
const GOOD_STATUSES: ReadonlySet<string> = new Set(GOOD_LISTING_STATUSES);

export function billingGraceDays(envValue: string | undefined = process.env.BILLING_GRACE_DAYS): number {
  if (envValue === undefined || envValue.trim() === "") return 7;
  const parsed = Number(envValue);
  if (!Number.isInteger(parsed) || parsed < 0) return 7;
  return parsed;
}

export function mapStripeSubscriptionStatus(
  stripeStatus: string,
  deleted: boolean,
): SellerSubscriptionStatus {
  if (deleted) return "CANCELED";
  switch (stripeStatus) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "canceled":
      return "CANCELED";
    case "paused":
      return "PAST_DUE";
    default:
      return "INCOMPLETE";
  }
}

/** The Price lookup key is the only tier input. Metadata is ignored. */
export function tierFromStripePrice(lookupKey: string | null, metadataTier: string | null): SellerTierId | null {
  // metadataTier is accepted so callers can show that a client-sent tier is ignored.
  void metadataTier;
  return tierFromLookupKey(lookupKey);
}

export function sellerListingsArePublic(
  seller: {
    approvalStatus: string;
    subscription: { status: string; delinquentSince: Date | null } | null;
  },
  now = new Date(),
  graceDays = billingGraceDays(),
): boolean {
  if (seller.approvalStatus !== "APPROVED") return false;
  const subscription = seller.subscription;
  if (!subscription) return false;
  if (GOOD_STATUSES.has(subscription.status as SellerSubscriptionStatus)) return true;
  if (!GRACE_STATUSES.has(subscription.status as SellerSubscriptionStatus)) return false;
  if (!subscription.delinquentSince) return false;
  const cutoff = now.getTime() - graceDays * 24 * 60 * 60 * 1000;
  return subscription.delinquentSince.getTime() > cutoff;
}

export function evaluateFoundingEligibility(input: {
  promotionCode: string | null;
  adminFlag: boolean;
  slotsUsedByOthers: number;
  alreadyClaimed: boolean;
  cap?: number;
}): { founder: boolean } | { error: string } {
  const cap = input.cap ?? FOUNDING_OFFER.maxRedemptions;
  const asked =
    input.adminFlag ||
    (input.promotionCode !== null && input.promotionCode.trim().toUpperCase() === FOUNDING_OFFER.promoCode) ||
    input.alreadyClaimed;
  if (!asked) return { founder: false };
  if (input.alreadyClaimed || input.slotsUsedByOthers < cap) return { founder: true };
  return { error: "The Founding Artist offer is full. The first 50 sellers have already claimed it." };
}

export function trialDaysForCheckout(founder: boolean): number {
  return founder ? FOUNDING_OFFER.trialDays : 7;
}

export function randomIntegrationSuffix(bytes = crypto.getRandomValues(new Uint8Array(8))): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
  }
  return suffix;
}

export function sellerSubscriptionCheckoutParams(input: {
  priceId: string;
  sellerProfileId: string;
  customerId: string | null;
  customerEmail: string;
  founder: boolean;
  siteUrl: string;
  integrationSuffix: string;
}): Stripe.Checkout.SessionCreateParams {
  if (!/^[a-z]{8}$/.test(input.integrationSuffix)) {
    throw new Error("Checkout integration suffix must be 8 letters.");
  }
  const metadata: Record<string, string> = {
    kind: "seller_subscription",
    sellerProfileId: input.sellerProfileId,
  };
  const subscriptionMetadata: Record<string, string> = {
    sellerProfileId: input.sellerProfileId,
  };
  if (input.founder) {
    subscriptionMetadata[FOUNDING_OFFER.metadataKey] = FOUNDING_OFFER.metadataValue;
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    client_reference_id: input.sellerProfileId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    metadata,
    // Other promotion codes can be entered on the Stripe page. FOUNDING50 is
    // decided here, before the session exists, because it changes the trial.
    allow_promotion_codes: true,
    integration_identifier: `upsycle_seller_subscription_${input.integrationSuffix}`,
    subscription_data: {
      trial_period_days: trialDaysForCheckout(input.founder),
      metadata: subscriptionMetadata,
    },
    success_url: `${input.siteUrl}/sell/billing?checkout=success`,
    cancel_url: `${input.siteUrl}/sell/billing?checkout=cancel`,
  };

  if (input.customerId) {
    params.customer = input.customerId;
  } else {
    params.customer_email = input.customerEmail;
  }
  return params;
}

export interface FoundingSchedulePhase {
  priceId: string;
  startDate?: number;
  endDate?: number;
  trialEnd?: number;
  durationMonths?: number;
  couponId?: string;
  clearDiscounts?: boolean;
}

/**
 * Phase 1 is the free trial with no coupon. Phase 2 is 9 months at 50% off.
 * Phase 3 is the current price with the coupon removed. Callers pass the
 * Price id the seller already subscribed to. This does not pick a new price.
 */
export function foundingCouponSchedule(input: {
  priceId: string;
  phaseStart: number;
  trialEnd: number;
  couponId?: string;
}): FoundingSchedulePhase[] | null {
  if (input.trialEnd <= input.phaseStart) return null;
  return [
    {
      priceId: input.priceId,
      startDate: input.phaseStart,
      endDate: input.trialEnd,
      trialEnd: input.trialEnd,
      clearDiscounts: true,
    },
    {
      priceId: input.priceId,
      durationMonths: FOUNDING_OFFER.durationInMonths,
      couponId: input.couponId ?? FOUNDING_OFFER.couponId,
    },
    {
      priceId: input.priceId,
      clearDiscounts: true,
    },
  ];
}

export function shouldScheduleFoundingCoupon(record: SellerBillingRecord, now: Date): boolean {
  if (!record.foundingArtist || record.foundingCouponScheduled) return false;
  if (record.status !== "TRIALING") return false;
  if (!record.trialEnd) return false;
  return record.trialEnd.getTime() > now.getTime();
}

function delinquentSinceFor(
  status: SellerSubscriptionStatus,
  current: Date | null,
  now: Date,
): Date | null {
  if (GOOD_STATUSES.has(status)) return null;
  if (GRACE_STATUSES.has(status)) return current ?? now;
  return null;
}

export function applyBillingEvent(state: BillingState, signal: BillingSignal, now: Date): BillingApplyResult {
  if (state.processedEventIds.includes(signal.eventId)) {
    return { state, duplicate: true, applied: true, tierChanged: false, scheduleFoundingCoupon: false };
  }

  const processedEventIds = [...state.processedEventIds, signal.eventId];
  const untouched = { duplicate: false, applied: false, tierChanged: false, scheduleFoundingCoupon: false };

  if (signal.kind === "invoice_paid" || signal.kind === "invoice_payment_failed") {
    const current = state.record;
    if (!current || current.sellerProfileId !== signal.sellerProfileId) {
      return { state, ...untouched };
    }
    if (signal.kind === "invoice_paid") {
      if (current.status === "PAST_DUE" || current.status === "UNPAID" || current.status === "INCOMPLETE") {
        const record = { ...current, status: "ACTIVE" as const, delinquentSince: null };
        return {
          state: { record, processedEventIds },
          duplicate: false,
          applied: true,
          tierChanged: false,
          scheduleFoundingCoupon: false,
        };
      }
      return {
        state: { record: current, processedEventIds },
        duplicate: false,
        applied: true,
        tierChanged: false,
        scheduleFoundingCoupon: false,
      };
    }
    if (current.status === "CANCELED" || current.status === "COMPED") {
      return {
        state: { record: current, processedEventIds },
        duplicate: false,
        applied: true,
        tierChanged: false,
        scheduleFoundingCoupon: false,
      };
    }
    const record = {
      ...current,
      status: "PAST_DUE" as const,
      delinquentSince: current.delinquentSince ?? now,
    };
    return {
      state: { record, processedEventIds },
      duplicate: false,
      applied: true,
      tierChanged: false,
      scheduleFoundingCoupon: false,
    };
  }

  const snapshot = signal.snapshot;
  const sellerProfileId = snapshot.sellerProfileId ?? state.record?.sellerProfileId ?? null;
  if (!sellerProfileId) {
    return { state, ...untouched };
  }

  const pricedTier = tierFromStripePrice(snapshot.lookupKey, snapshot.metadataTier);
  const tier = pricedTier ?? state.record?.tier ?? null;
  if (!tier) {
    return { state, ...untouched };
  }

  const status = mapStripeSubscriptionStatus(snapshot.stripeStatus, snapshot.deleted);
  const previous = state.record;
  const record: SellerBillingRecord = {
    sellerProfileId,
    tier,
    status,
    stripeCustomerId: snapshot.customerId ?? previous?.stripeCustomerId ?? null,
    stripeSubscriptionId: snapshot.subscriptionId,
    stripePriceId: snapshot.priceId ?? previous?.stripePriceId ?? null,
    billingInterval: snapshot.interval ?? previous?.billingInterval ?? null,
    currentPeriodEnd: snapshot.currentPeriodEnd ?? previous?.currentPeriodEnd ?? null,
    trialEnd: snapshot.trialEnd ?? previous?.trialEnd ?? null,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    foundingArtist: Boolean(previous?.foundingArtist || snapshot.foundingArtist),
    foundingCouponScheduled: Boolean(previous?.foundingCouponScheduled || snapshot.couponOnSubscription),
    delinquentSince: delinquentSinceFor(status, previous?.delinquentSince ?? null, now),
  };

  return {
    state: { record, processedEventIds },
    duplicate: false,
    applied: true,
    tierChanged: previous?.tier !== tier,
    scheduleFoundingCoupon: shouldScheduleFoundingCoupon(record, now) && !snapshot.couponOnSubscription,
  };
}

export function billingBanner(
  record: SellerBillingRecord | null,
  now: Date,
  graceDays = billingGraceDays(),
): { tone: "info" | "warning"; message: string } | null {
  if (!record || record.status === "COMPED" || record.status === "INCOMPLETE") {
    return {
      tone: "info",
      message:
        "Choose a plan to publish your shop. New sellers get a 7-day free trial. Founding Artist sellers get 90 days free, then 50% off for 9 months.",
    };
  }
  if (record.status === "TRIALING" && record.trialEnd) {
    const when = record.trialEnd.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const founding = record.foundingArtist
      ? " After that, Founding Artist pricing is 50% off for 9 months, then the current plan price."
      : " Add a card in Manage billing so the shop stays open.";
    return { tone: "info", message: `Your free trial ends on ${when}.${founding}` };
  }
  if (record.cancelAtPeriodEnd && record.currentPeriodEnd && (record.status === "ACTIVE" || record.status === "TRIALING")) {
    const when = record.currentPeriodEnd.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return { tone: "warning", message: `Your plan is set to cancel on ${when}.` };
  }
  if (GRACE_STATUSES.has(record.status)) {
    const visible = sellerListingsArePublic(
      { approvalStatus: "APPROVED", subscription: { status: record.status, delinquentSince: record.delinquentSince } },
      now,
      graceDays,
    );
    if (visible && record.delinquentSince) {
      const hideOn = new Date(record.delinquentSince.getTime() + graceDays * 24 * 60 * 60 * 1000);
      const when = hideOn.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      return {
        tone: "warning",
        message: `Your payment needs attention. Your listings stay visible until ${when}, then they are hidden.`,
      };
    }
    return {
      tone: "warning",
      message: "Your listings are hidden because the plan is past due or canceled. Manage billing to publish the shop again.",
    };
  }
  return null;
}

/** stripe-setup refuses live keys before it creates anything. */
export function assertTestModeSecretKey(key: string | undefined): void {
  if (!key || !key.trim()) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_") || key.includes("_live_")) {
    throw new Error("Refusing to run stripe-setup with a live Stripe key.");
  }
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("stripe-setup only runs with a test key (sk_test_ or rk_test_).");
  }
}
