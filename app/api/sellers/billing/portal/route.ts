// Opens the Stripe Customer Portal so a seller can update a card, switch
// plans (with proration), or cancel at the end of the period.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSellerAuth, sellerAuthErrorResponse } from "@/lib/seller-auth";
import { getStripeClient } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site-url";

const PORTAL_METADATA_KEY = "upsycle_portal";
const PORTAL_METADATA_VALUE = "seller_plans";

export async function POST() {
  const auth = await resolveSellerAuth();
  if (!auth.ok) return sellerAuthErrorResponse(auth.failure);

  const seller = await prisma.sellerProfile.findUnique({
    where: { id: auth.seller.sellerProfileId },
    select: { subscription: { select: { stripeCustomerId: true } } },
  });
  const customerId = seller?.subscription?.stripeCustomerId;
  if (!customerId) {
    return NextResponse.json({ error: "Start a plan before managing billing." }, { status: 409 });
  }

  let siteUrl: string;
  try {
    siteUrl = getSiteUrl();
  } catch (err) {
    console.error("Billing portal refused because SITE_URL is not configured", err);
    return NextResponse.json({ error: "Billing is temporarily unavailable." }, { status: 503 });
  }

  try {
    const stripe = getStripeClient();
    const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
    const configuration = configurations.data.find(
      (item) => item.metadata?.[PORTAL_METADATA_KEY] === PORTAL_METADATA_VALUE && item.active,
    );
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/sell/billing`,
      ...(configuration ? { configuration: configuration.id } : {}),
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Failed to open the billing portal", err);
    return NextResponse.json({ error: "Billing is temporarily unavailable." }, { status: 503 });
  }
}
