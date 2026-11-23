/**
 * Creates UpSycle seller-plan products, prices, the Founding Artist coupon,
 * and the Customer Portal configuration in Stripe test mode.
 *
 * Refuses to run with a live key. Does not change existing subscriptions.
 * Sellers move to a new price when they check out or switch plans in the portal.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-setup.ts
 */
import Stripe from "stripe";
import { assertTestModeSecretKey } from "../lib/seller-billing";
import {
  FOUNDING_OFFER,
  SELLER_PLAN_TAX_CODE,
  SELLER_PLANS,
  planAnnualPriceCents,
  sellerPlanLookupKey,
  type BillingInterval,
  type SellerTierId,
} from "../lib/tiers";

const PORTAL_METADATA_KEY = "upsycle_portal";
const PORTAL_METADATA_VALUE = "seller_plans";

type Action = { action: "created" | "unchanged" | "replaced" | "updated"; resource: string; id: string; detail?: string };

const actions: Action[] = [];

function log(entry: Action) {
  actions.push(entry);
  const extra = entry.detail ? ` (${entry.detail})` : "";
  console.log(`${entry.action} ${entry.resource} ${entry.id}${extra}`);
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  assertTestModeSecretKey(key);
  const stripe = new Stripe(key as string, { apiVersion: "2026-09-30.endive", typescript: true });

  const balance = await stripe.balance.retrieve();
  if (balance.livemode) {
    throw new Error("Refusing to run stripe-setup because this key is in live mode.");
  }

  const priceIds = new Map<string, string>();
  for (const plan of SELLER_PLANS) {
    const tierNumber = plan.id === "TIER_1" ? "1" : plan.id === "TIER_2" ? "2" : "3";
    const product = await ensureProduct(stripe, plan.id, `UpSycle Tier ${tierNumber}`, plan.name);
    for (const interval of ["month", "year"] as const) {
      const lookupKey = sellerPlanLookupKey(plan.id, interval);
      const unitAmount = interval === "year" ? planAnnualPriceCents(plan.id) : plan.monthlyPriceCents;
      const priceId = await ensurePrice(stripe, product.id, lookupKey, unitAmount, interval);
      priceIds.set(lookupKey, priceId);
    }
  }

  const couponId = await ensureFoundingCoupon(stripe);
  await ensureFoundingPromo(stripe, couponId);
  await ensurePortal(stripe, priceIds);

  console.log("\nDone. Existing subscriptions were not modified.");
  console.log(JSON.stringify({ actions }, null, 2));
}

async function ensureProduct(stripe: Stripe, tier: SellerTierId, name: string, displayName: string): Promise<Stripe.Product> {
  const metadataKey = tier.toLowerCase();
  const found = await stripe.products.search({
    query: `active:'true' AND metadata['upsycle_plan']:'${metadataKey}'`,
    limit: 1,
  });
  const existing = found.data.find((product) => product.name !== "UpSycle Market Subscription Fees");
  if (existing) {
    if (existing.tax_code !== SELLER_PLAN_TAX_CODE || existing.name !== name) {
      const updated = await stripe.products.update(existing.id, {
        name,
        tax_code: SELLER_PLAN_TAX_CODE,
        description: `${displayName} shop plan`,
      });
      log({ action: "updated", resource: "product", id: updated.id, detail: name });
      return updated;
    }
    log({ action: "unchanged", resource: "product", id: existing.id, detail: name });
    return existing;
  }
  const created = await stripe.products.create({
    name,
    description: `${displayName} shop plan`,
    tax_code: SELLER_PLAN_TAX_CODE,
    metadata: { upsycle_plan: metadataKey, upsycle_role: "seller_subscription" },
  });
  log({ action: "created", resource: "product", id: created.id, detail: name });
  return created;
}

async function ensurePrice(
  stripe: Stripe,
  productId: string,
  lookupKey: string,
  unitAmount: number,
  interval: BillingInterval,
): Promise<string> {
  const listed = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const current = listed.data[0];
  const matches =
    current &&
    current.unit_amount === unitAmount &&
    current.currency === "usd" &&
    current.tax_behavior === "exclusive" &&
    current.recurring?.interval === interval &&
    current.product === productId;
  if (current && matches) {
    log({ action: "unchanged", resource: "price", id: current.id, detail: lookupKey });
    return current.id;
  }
  const created = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: unitAmount,
    tax_behavior: "exclusive",
    lookup_key: lookupKey,
    transfer_lookup_key: Boolean(current),
    recurring: { interval },
    metadata: { lookup_key: lookupKey },
  });
  log({
    action: current ? "replaced" : "created",
    resource: "price",
    id: created.id,
    detail: `${lookupKey} ${unitAmount} cents. Open subscriptions keep their current price until they change plans.`,
  });
  return created.id;
}

async function ensureFoundingCoupon(stripe: Stripe): Promise<string> {
  try {
    const existing = await stripe.coupons.retrieve(FOUNDING_OFFER.couponId);
    if (existing.percent_off !== FOUNDING_OFFER.percentOff || existing.duration !== "repeating" || existing.duration_in_months !== FOUNDING_OFFER.durationInMonths) {
      throw new Error(
        `Coupon ${FOUNDING_OFFER.couponId} already exists with different terms. Create a new coupon id instead of editing it.`,
      );
    }
    log({ action: "unchanged", resource: "coupon", id: existing.id });
    return existing.id;
  } catch (err) {
    if (!isMissing(err)) throw err;
  }
  const created = await stripe.coupons.create({
    id: FOUNDING_OFFER.couponId,
    name: "Founding Artist 50% off for 9 months",
    percent_off: FOUNDING_OFFER.percentOff,
    duration: FOUNDING_OFFER.duration,
    duration_in_months: FOUNDING_OFFER.durationInMonths,
    max_redemptions: FOUNDING_OFFER.maxRedemptions,
    metadata: { upsycle: "founding_artist" },
  });
  log({ action: "created", resource: "coupon", id: created.id, detail: "50% off for 9 months after the 90-day trial, max 50" });
  return created.id;
}

async function ensureFoundingPromo(stripe: Stripe, couponId: string) {
  const listed = await stripe.promotionCodes.list({ code: FOUNDING_OFFER.promoCode, limit: 1 });
  const existing = listed.data[0];
  if (existing) {
    log({ action: "unchanged", resource: "promotion_code", id: existing.id, detail: FOUNDING_OFFER.promoCode });
    return;
  }
  const created = await stripe.promotionCodes.create({
    code: FOUNDING_OFFER.promoCode,
    max_redemptions: FOUNDING_OFFER.maxRedemptions,
    promotion: { type: "coupon", coupon: couponId },
    metadata: { upsycle: "founding_artist" },
  });
  log({ action: "created", resource: "promotion_code", id: created.id, detail: FOUNDING_OFFER.promoCode });
}

async function ensurePortal(stripe: Stripe, priceIds: Map<string, string>) {
  const products = new Map<string, string[]>();
  for (const plan of SELLER_PLANS) {
    const monthly = priceIds.get(sellerPlanLookupKey(plan.id, "month"));
    const annual = priceIds.get(sellerPlanLookupKey(plan.id, "year"));
    if (!monthly || !annual) continue;
    const monthlyPrice = await stripe.prices.retrieve(monthly);
    const productId = typeof monthlyPrice.product === "string" ? monthlyPrice.product : monthlyPrice.product.id;
    products.set(productId, [monthly, annual]);
  }
  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    customer_update: { enabled: false },
    subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products: [...products.entries()].map(([product, prices]) => ({ product, prices })),
    },
  };
  const listed = await stripe.billingPortal.configurations.list({ limit: 100 });
  const existing = listed.data.find((item) => item.metadata?.[PORTAL_METADATA_KEY] === PORTAL_METADATA_VALUE);
  if (existing) {
    const updated = await stripe.billingPortal.configurations.update(existing.id, {
      features,
      metadata: { [PORTAL_METADATA_KEY]: PORTAL_METADATA_VALUE },
    });
    log({ action: "updated", resource: "portal_configuration", id: updated.id, detail: "plan switching uses current prices" });
    return;
  }
  const created = await stripe.billingPortal.configurations.create({
    features,
    metadata: { [PORTAL_METADATA_KEY]: PORTAL_METADATA_VALUE },
    business_profile: { headline: "Manage your UpSycle shop plan" },
  });
  log({ action: "created", resource: "portal_configuration", id: created.id });
}

function isMissing(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "resource_missing";
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "stripe-setup failed";
  console.error(message);
  process.exit(1);
});
