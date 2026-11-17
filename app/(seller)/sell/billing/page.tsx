import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSellerPageAuth, sellerAuthFailureMessage } from "@/lib/seller-auth";
import { findSellerBillingRecord } from "@/lib/stripe-subscription-sync";
import BillingBanner, { currentPlanSummary } from "@/components/seller/BillingBanner";
import SellerPlanPicker from "@/components/seller/SellerPlanPicker";
import { SELLER_PLANS } from "@/lib/tiers";

export const metadata: Metadata = {
  title: "Billing — UpSycle Market",
};

export const dynamic = "force-dynamic";

export default async function SellerBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const auth = await requireSellerPageAuth("/sell/billing");
  const { checkout } = await searchParams;

  if (!auth.ok) {
    return (
      <div className="border border-[var(--border)] bg-[var(--charcoal)] p-10 text-center md:p-14">
        <h1 className="sec-title">
          Not quite <em>ready yet</em>
        </h1>
        <p className="mx-auto mb-8 max-w-xl text-[0.95rem] font-light leading-loose text-[var(--muted2)]">
          {sellerAuthFailureMessage(auth.failure)}
        </p>
        {auth.failure.kind === "no-seller-profile" && (
          <Link href="/sell/signup" className="btn-primary">
            Apply to Sell
          </Link>
        )}
      </div>
    );
  }

  const [record, seller] = await Promise.all([
    findSellerBillingRecord({ sellerProfileId: auth.seller.sellerProfileId }),
    prisma.sellerProfile.findUnique({
      where: { id: auth.seller.sellerProfileId },
      select: { foundingOffer: true },
    }),
  ]);

  const notice =
    checkout === "success"
      ? "Stripe has your checkout. Your plan updates when Stripe notifies UpSycle. This page does not change your tier."
      : checkout === "cancel"
        ? "Checkout was canceled. You have not been charged."
        : null;

  return (
    <div>
      <div className="mb-8">
        <div className="eyebrow before:hidden">My Shop</div>
        <h1 className="sec-title">
          Plan & <em>billing</em>
        </h1>
        <p className="mt-2 text-[0.9rem] font-light text-[var(--muted2)]">{currentPlanSummary(record)}</p>
      </div>
      {notice && (
        <p className="mb-6 border border-[var(--border)] px-4 py-3 text-[0.88rem] font-light text-[var(--cream)]">
          {notice}
        </p>
      )}
      <BillingBanner record={record} />
      <div className="border border-[var(--border)] bg-[var(--charcoal)] p-6 md:p-8">
        <SellerPlanPicker
          plans={SELLER_PLANS}
          foundingOffer={seller?.foundingOffer ?? false}
          canManageBilling={Boolean(record?.stripeCustomerId)}
        />
      </div>
    </div>
  );
}
