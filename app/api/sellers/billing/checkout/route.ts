// Starts a seller subscription Checkout Session. The seller chooses a plan
// here. The billed tier is written later, by the Stripe webhook, from the
// Price lookup key. A founding boolean in the body is ignored.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSellerAuth, sellerAuthErrorResponse } from "@/lib/seller-auth";
import { getStripeClient } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site-url";
import {
  evaluateFoundingEligibility,
  randomIntegrationSuffix,
  sellerSubscriptionCheckoutParams,
} from "@/lib/seller-billing";
import { FOUNDING_CLAIM_HOLD_MS, isSellerTierId, sellerPlanLookupKey, type BillingInterval } from "@/lib/tiers";

export async function POST(request: NextRequest) {
  const auth = await resolveSellerAuth();
  if (!auth.ok) return sellerAuthErrorResponse(auth.failure);

  let body: { tier?: unknown; interval?: unknown; promotionCode?: unknown };
  try {
    body = (await request.json()) as { tier?: unknown; interval?: unknown; promotionCode?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const tier = typeof body.tier === "string" ? body.tier : null;
  if (!isSellerTierId(tier)) {
    return NextResponse.json({ error: "Choose Tier 1, Tier 2, or Tier 3." }, { status: 400 });
  }
  const interval: BillingInterval | null = body.interval === "year" ? "year" : body.interval === "month" ? "month" : null;
  if (!interval) {
    return NextResponse.json({ error: "Choose monthly or annual billing." }, { status: 400 });
  }
  const promotionCode = typeof body.promotionCode === "string" ? body.promotionCode : null;

  const seller = await prisma.sellerProfile.findUnique({
    where: { id: auth.seller.sellerProfileId },
    include: { subscription: true, user: { select: { email: true } }, foundingClaim: true },
  });
  if (!seller) {
    return NextResponse.json({ error: "Seller profile not found." }, { status: 404 });
  }

  const live = seller.subscription;
  if (live?.stripeSubscriptionId && (live.status === "ACTIVE" || live.status === "TRIALING" || live.status === "PAST_DUE")) {
    return NextResponse.json(
      { error: "You already have a plan. Use Manage billing to change it." },
      { status: 409 },
    );
  }

  const cutoff = new Date(Date.now() - FOUNDING_CLAIM_HOLD_MS);
  const claimIsLive =
    seller.foundingClaim !== null &&
    seller.foundingClaim.status !== "RELEASED" &&
    (seller.foundingClaim.status === "CONFIRMED" || seller.foundingClaim.updatedAt > cutoff);

  let founder = false;
  try {
    founder = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('upsycle_founding_offer')::bigint)`;
      const claims = await tx.foundingOfferClaim.findMany({
        select: { sellerProfileId: true, status: true, updatedAt: true },
      });
      const slotsUsedByOthers = claims.filter((claim) => {
        if (claim.sellerProfileId === seller.id) return false;
        if (claim.status === "CONFIRMED") return true;
        return claim.status === "PENDING" && claim.updatedAt > cutoff;
      }).length;
      const decision = evaluateFoundingEligibility({
        promotionCode,
        adminFlag: seller.foundingOffer,
        slotsUsedByOthers,
        alreadyClaimed: claimIsLive,
      });
      if ("error" in decision) {
        throw new FoundingCapError(decision.error);
      }
      if (!decision.founder) return false;
      if (seller.foundingClaim) {
        await tx.foundingOfferClaim.update({
          where: { sellerProfileId: seller.id },
          data: { status: "PENDING", stripeCheckoutSessionId: null },
        });
      } else {
        await tx.foundingOfferClaim.create({
          data: { sellerProfileId: seller.id, status: "PENDING" },
        });
      }
      return true;
    });
  } catch (err) {
    if (err instanceof FoundingCapError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  let siteUrl: string;
  try {
    siteUrl = getSiteUrl();
  } catch (err) {
    console.error("Seller checkout refused because SITE_URL is not configured", err);
    if (founder) await releasePendingClaim(seller.id);
    return NextResponse.json({ error: "Billing is temporarily unavailable." }, { status: 503 });
  }

  const stripe = getStripeClient();
  const lookupKey = sellerPlanLookupKey(tier, interval);
  let priceId: string;
  try {
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) {
      throw new Error(`No Stripe price for ${lookupKey}.`);
    }
    priceId = price.id;
  } catch (err) {
    console.error("Seller plan price lookup failed", err);
    if (founder) await releasePendingClaim(seller.id);
    return NextResponse.json(
      { error: "That plan is not available yet. Ask us to run the Stripe setup script in test mode." },
      { status: 503 },
    );
  }

  try {
    const session = await stripe.checkout.sessions.create(
      sellerSubscriptionCheckoutParams({
        priceId,
        sellerProfileId: seller.id,
        customerId: seller.subscription?.stripeCustomerId ?? null,
        customerEmail: seller.user.email,
        founder,
        siteUrl,
        integrationSuffix: randomIntegrationSuffix(),
      }),
    );
    if (!session.url) throw new Error("Stripe did not return a Checkout Session URL.");
    if (founder) {
      await prisma.foundingOfferClaim.update({
        where: { sellerProfileId: seller.id },
        data: { stripeCheckoutSessionId: session.id },
      });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Failed to create seller subscription checkout", err);
    if (founder) await releasePendingClaim(seller.id);
    return NextResponse.json({ error: "Billing is temporarily unavailable." }, { status: 503 });
  }
}

async function releasePendingClaim(sellerProfileId: string) {
  await prisma.foundingOfferClaim.updateMany({
    where: { sellerProfileId, status: "PENDING" },
    data: { status: "RELEASED" },
  });
}

class FoundingCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoundingCapError";
  }
}
