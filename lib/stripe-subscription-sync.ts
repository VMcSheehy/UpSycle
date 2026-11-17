import type { SellerTier } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import {
  applyBillingEvent,
  foundingCouponSchedule,
  type BillingApplyResult,
  type BillingSignal,
  type SellerBillingRecord,
  type SubscriptionSnapshot,
} from "@/lib/seller-billing";
import { FOUNDING_OFFER, intervalFromLookupKey, type BillingInterval } from "@/lib/tiers";

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function couponIdFromDiscount(discount: unknown): string | null {
  if (!discount || typeof discount !== "object") return null;
  const source = "source" in discount ? (discount as { source?: { coupon?: string | { id: string } | null } }).source : undefined;
  const coupon = source?.coupon;
  if (!coupon) return null;
  return typeof coupon === "string" ? coupon : coupon.id;
}

export function subscriptionHasFoundingCoupon(subscription: Stripe.Subscription): boolean {
  return subscription.discounts.some((discount) => couponIdFromDiscount(discount) === FOUNDING_OFFER.couponId);
}

export async function snapshotFromSubscription(
  subscription: Stripe.Subscription,
  deleted: boolean,
): Promise<SubscriptionSnapshot> {
  const stripe = getStripeClient();
  const item = subscription.items.data[0];
  let price = item?.price ?? null;
  if (price && typeof price === "string") {
    price = await stripe.prices.retrieve(price);
  }
  const lookupKey = price && typeof price !== "string" ? price.lookup_key : null;
  const intervalRaw = price && typeof price !== "string" ? price.recurring?.interval : null;
  const interval: BillingInterval | null =
    intervalRaw === "year" ? "year" : intervalRaw === "month" ? "month" : intervalFromLookupKey(lookupKey);

  return {
    sellerProfileId: subscription.metadata.sellerProfileId ?? null,
    subscriptionId: subscription.id,
    customerId: idOf(subscription.customer),
    stripeStatus: subscription.status,
    deleted,
    lookupKey,
    metadataTier: subscription.metadata.tier ?? null,
    priceId: price ? (typeof price === "string" ? price : price.id) : null,
    interval,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    foundingArtist: subscription.metadata[FOUNDING_OFFER.metadataKey] === FOUNDING_OFFER.metadataValue,
    couponOnSubscription: subscriptionHasFoundingCoupon(subscription),
  };
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details;
  if (!details) return null;
  return idOf(details.subscription);
}

export async function findSellerBillingRecord(lookup: {
  sellerProfileId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<SellerBillingRecord | null> {
  const or = [
    lookup.sellerProfileId ? { sellerProfileId: lookup.sellerProfileId } : null,
    lookup.subscriptionId ? { stripeSubscriptionId: lookup.subscriptionId } : null,
    lookup.customerId ? { stripeCustomerId: lookup.customerId } : null,
  ].filter((clause): clause is { sellerProfileId: string } | { stripeSubscriptionId: string } | { stripeCustomerId: string } =>
    clause !== null,
  );
  if (or.length === 0) return null;
  const subscription = await prisma.sellerSubscription.findFirst({
    where: { OR: or },
    include: { tierPlan: { select: { tier: true } } },
  });
  if (!subscription) return null;
  return recordFromRow(subscription);
}

function recordFromRow(
  subscription: {
    sellerProfileId: string;
    status: SellerBillingRecord["status"];
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripePriceId: string | null;
    billingInterval: string | null;
    currentPeriodEnd: Date | null;
    trialEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    foundingArtist: boolean;
    foundingCouponScheduled: boolean;
    delinquentSince: Date | null;
    tierPlan: { tier: SellerTier };
  },
): SellerBillingRecord {
  return {
    sellerProfileId: subscription.sellerProfileId,
    tier: subscription.tierPlan.tier,
    status: subscription.status,
    stripeCustomerId: subscription.stripeCustomerId,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    stripePriceId: subscription.stripePriceId,
    billingInterval:
      subscription.billingInterval === "month" || subscription.billingInterval === "year"
        ? subscription.billingInterval
        : null,
    currentPeriodEnd: subscription.currentPeriodEnd,
    trialEnd: subscription.trialEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    foundingArtist: subscription.foundingArtist,
    foundingCouponScheduled: subscription.foundingCouponScheduled,
    delinquentSince: subscription.delinquentSince,
  };
}

export async function scheduleFoundingCoupon(subscriptionId: string): Promise<void> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price", "schedule"],
  });
  const item = subscription.items.data[0];
  const priceId = item ? (typeof item.price === "string" ? item.price : item.price.id) : null;
  const trialEnd = subscription.trial_end;
  if (!priceId || !trialEnd) {
    throw new Error("Founding subscription is missing a price or trial end, so the coupon was not scheduled.");
  }

  const existingSchedule = subscription.schedule;
  const schedule =
    existingSchedule && typeof existingSchedule !== "string"
      ? existingSchedule
      : existingSchedule
        ? await stripe.subscriptionSchedules.retrieve(existingSchedule)
        : await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });

  const already = schedule.phases.some((phase) =>
    phase.discounts.some((discount) => couponIdFromDiscount(discount) === FOUNDING_OFFER.couponId),
  );
  if (already) return;

  const phaseStart = schedule.phases[0]?.start_date ?? subscription.start_date;
  const planned = foundingCouponSchedule({ priceId, phaseStart, trialEnd });
  if (!planned) return;

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    proration_behavior: "none",
    phases: planned.map((phase) => {
      const params: Stripe.SubscriptionScheduleUpdateParams.Phase = {
        items: [{ price: phase.priceId, quantity: 1 }],
        proration_behavior: "none",
      };
      if (phase.startDate !== undefined) params.start_date = phase.startDate;
      if (phase.endDate !== undefined) params.end_date = phase.endDate;
      if (phase.trialEnd !== undefined) params.trial_end = phase.trialEnd;
      if (phase.durationMonths) {
        params.duration = { interval: "month", interval_count: phase.durationMonths };
      }
      if (phase.couponId) params.discounts = [{ coupon: phase.couponId }];
      if (phase.clearDiscounts) params.discounts = "";
      return params;
    }),
  });
}

export async function persistBillingApply(
  result: BillingApplyResult,
  event: { id: string; type: string },
  previousTier: SellerTier | null,
): Promise<"saved" | "duplicate"> {
  const record = result.state.record;
  if (!record) return "saved";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.processedStripeEvent.create({ data: { id: event.id, type: event.type } });
      const plan = await tx.tierPlan.findUnique({ where: { tier: record.tier } });
      if (!plan) {
        throw new Error(`No tier plan is configured for ${record.tier}.`);
      }
      const data = {
        tierPlanId: plan.id,
        status: record.status,
        stripeCustomerId: record.stripeCustomerId,
        stripeSubscriptionId: record.stripeSubscriptionId,
        stripePriceId: record.stripePriceId,
        billingInterval: record.billingInterval,
        currentPeriodEnd: record.currentPeriodEnd,
        trialEnd: record.trialEnd,
        cancelAtPeriodEnd: record.cancelAtPeriodEnd,
        foundingArtist: record.foundingArtist,
        foundingCouponScheduled: record.foundingCouponScheduled,
        delinquentSince: record.delinquentSince,
      };
      await tx.sellerSubscription.upsert({
        where: { sellerProfileId: record.sellerProfileId },
        create: { sellerProfileId: record.sellerProfileId, ...data },
        update: data,
      });
      await tx.sellerProfile.update({
        where: { id: record.sellerProfileId },
        data: { tier: record.tier, searchRankWeight: plan.searchRankWeight },
      });
      if (result.tierChanged) {
        await tx.sellerTierChange.create({
          data: {
            sellerProfileId: record.sellerProfileId,
            fromTier: previousTier,
            toTier: record.tier,
            reason: "STRIPE_SYNC",
            stripeEventId: event.id,
          },
        });
      }
      if (record.foundingArtist) {
        await tx.foundingOfferClaim.updateMany({
          where: { sellerProfileId: record.sellerProfileId, status: "PENDING" },
          data: { status: "CONFIRMED" },
        });
      }
    });
    return "saved";
  } catch (err) {
    if (isUniqueConflict(err)) return "duplicate";
    throw err;
  }
}

function isUniqueConflict(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

export async function applyStripeBillingSignal(signal: BillingSignal, eventType: string): Promise<"saved" | "duplicate" | "retry"> {
  const existing = await prisma.processedStripeEvent.findUnique({ where: { id: signal.eventId } });
  if (existing) return "duplicate";

  const lookup =
    signal.kind === "subscription"
      ? {
          sellerProfileId: signal.snapshot.sellerProfileId,
          customerId: signal.snapshot.customerId,
          subscriptionId: signal.snapshot.subscriptionId,
        }
      : { sellerProfileId: signal.sellerProfileId };
  const current = await findSellerBillingRecord(lookup);
  const result = applyBillingEvent({ record: current, processedEventIds: [] }, signal, new Date());
  if (!result.applied || !result.state.record) return "retry";

  if (result.scheduleFoundingCoupon && result.state.record.stripeSubscriptionId) {
    await scheduleFoundingCoupon(result.state.record.stripeSubscriptionId);
    result.state.record.foundingCouponScheduled = true;
  }

  const saved = await persistBillingApply(result, { id: signal.eventId, type: eventType }, current?.tier ?? null);
  return saved === "duplicate" ? "duplicate" : "saved";
}
