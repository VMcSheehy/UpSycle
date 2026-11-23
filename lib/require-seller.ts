import type { SellerProfile } from "@prisma/client";

import { findSessionUserWithSeller } from "@/lib/session-user";

// Seller-page session states. The Cognito subject lookup is shared with
// lib/seller-auth.ts via lib/session-user.ts. Roles are Postgres rows.
export type SellerSessionState =
  | { status: "unauthenticated" }
  | { status: "no-profile"; userId: string }
  | { status: "not-approved"; userId: string; sellerProfile: SellerProfile }
  | { status: "approved"; userId: string; sellerProfile: SellerProfile };

export async function getSellerSessionState(): Promise<SellerSessionState> {
  const session = await findSessionUserWithSeller();
  if (!session) {
    return { status: "unauthenticated" };
  }
  const { user } = session;
  if (!user.sellerProfile) {
    return { status: "no-profile", userId: user.id };
  }
  if (user.sellerProfile.approvalStatus !== "APPROVED") {
    return { status: "not-approved", userId: user.id, sellerProfile: user.sellerProfile };
  }
  return { status: "approved", userId: user.id, sellerProfile: user.sellerProfile };
}

export interface ApprovedSeller {
  userId: string;
  sellerProfile: SellerProfile;
}

// Convenience wrapper for call sites (e.g. API routes) that only care about
// the success case and want a single "am I allowed?" check.
export async function getApprovedSeller(): Promise<ApprovedSeller | null> {
  const state = await getSellerSessionState();
  return state.status === "approved"
    ? { userId: state.userId, sellerProfile: state.sellerProfile }
    : null;
}
