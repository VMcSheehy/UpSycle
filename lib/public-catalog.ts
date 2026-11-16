import type { Prisma } from "@prisma/client";

// Products from pending or suspended sellers must not appear in the public
// catalog. Seller dashboards query Product directly and do not use this filter.
export const publiclyListedProductWhere = {
  sellerProfile: { approvalStatus: "APPROVED" },
} satisfies Prisma.ProductWhereInput;

export function isApprovedSellerStatus(status: string | null | undefined): boolean {
  return status === "APPROVED";
}
