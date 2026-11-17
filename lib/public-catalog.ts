import type { Prisma } from "@prisma/client";
import {
  billingGraceDays,
  GOOD_LISTING_STATUSES,
  GRACE_LISTING_STATUSES,
  sellerListingsArePublic,
} from "@/lib/seller-billing";

export { sellerListingsArePublic };

// Products from pending or suspended sellers must not appear in the public
// catalog, and neither do products from sellers whose plan is past the grace
// period. Seller dashboards query Product directly and do not use this filter.
export function publicSellerWhere(now = new Date()): Prisma.SellerProfileWhereInput {
  const cutoff = new Date(now.getTime() - billingGraceDays() * 24 * 60 * 60 * 1000);
  return {
    approvalStatus: "APPROVED",
    subscription: {
      OR: [
        { status: { in: [...GOOD_LISTING_STATUSES] } },
        { status: { in: [...GRACE_LISTING_STATUSES] }, delinquentSince: { gt: cutoff } },
      ],
    },
  };
}

export function publiclyListedProductWhere(now = new Date()): Prisma.ProductWhereInput {
  return { sellerProfile: publicSellerWhere(now) };
}

export function isApprovedSellerStatus(status: string | null | undefined): boolean {
  return status === "APPROVED";
}

export const listingSubscriptionSelect = {
  status: true,
  delinquentSince: true,
} as const;
