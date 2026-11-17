import Link from "next/link";
import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { requireSellerPageAuth, sellerAuthFailureMessage } from "@/lib/seller-auth";
import ShopStoryEditor from "@/components/seller/ShopStoryEditor";
import BillingBanner, { currentPlanSummary } from "@/components/seller/BillingBanner";
import { findSellerBillingRecord } from "@/lib/stripe-subscription-sync";

export const metadata: Metadata = {
  title: "Shop Settings — UpSycle Market",
};

// Always fetched live from the DB — no build-time prerender.
export const dynamic = "force-dynamic";

export default async function SellerProfilePage() {
  const auth = await requireSellerPageAuth("/sell/profile");

  if (!auth.ok) {
    return (
      <div className="border border-[var(--border)] bg-[var(--charcoal)] p-10 text-center md:p-14">
        <div className="eyebrow justify-center before:hidden">Shop Settings</div>
        <h1 className="sec-title">
          Not quite <em>ready yet</em>
        </h1>
        <p className="mx-auto mb-8 max-w-xl text-[0.95rem] font-light leading-loose text-[var(--muted2)]">
          {sellerAuthFailureMessage(auth.failure)}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          {auth.failure.kind === "no-seller-profile" && (
            <Link href="/sell/signup" className="btn-primary">
              Apply to Sell
            </Link>
          )}
          <Link href="/" className="btn-secondary">
            Back to UpSycle Market
          </Link>
        </div>
      </div>
    );
  }

  const [sellerProfile, billing] = await Promise.all([
    prisma.sellerProfile.findUniqueOrThrow({
      where: { id: auth.seller.sellerProfileId },
      select: { slug: true, story: true },
    }),
    findSellerBillingRecord({ sellerProfileId: auth.seller.sellerProfileId }),
  ]);

  return (
    <div>
      <div className="mb-10">
        <div className="eyebrow before:hidden">My Shop</div>
        <h1 className="sec-title">
          Shop <em>settings</em>
        </h1>
        <p className="mt-3 text-[0.85rem] font-light text-[var(--muted2)]">
          Your public shop page:{" "}
          <Link href={`/sellers/${sellerProfile.slug}`} className="text-[var(--rg-light)] underline">
            /sellers/{sellerProfile.slug}
          </Link>
        </p>
      </div>

      <div className="border border-[var(--border)] bg-[var(--charcoal)] p-6 md:p-8">
        <ShopStoryEditor initialStory={sellerProfile.story ?? ""} />
      </div>

      <div className="mt-8">
        <BillingBanner record={billing} />
        <div className="border border-[var(--border)] bg-[var(--charcoal)] p-6 md:p-8">
          <p className="text-[0.65rem] font-medium tracking-[0.13em] text-[var(--muted)] uppercase">Current plan</p>
          <p className="mt-2 text-[0.95rem] text-[var(--cream)]">{currentPlanSummary(billing)}</p>
          <p className="mt-3 text-[0.85rem] font-light text-[var(--muted2)]">
            Your tier changes only after Stripe confirms the subscription. Manage the card, switch plans, or cancel at the end of the period from billing.
          </p>
          <Link href="/sell/billing" className="btn-secondary mt-4 inline-block">
            Open billing
          </Link>
        </div>
      </div>
    </div>
  );
}
