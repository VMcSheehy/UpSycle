import { redirect } from "next/navigation";

import { findSessionUser } from "@/lib/session-user";
import type { User } from "@prisma/client";

// Shared "who is logged in" resolvers for anything past app/account/page.tsx's
// smoke test. Two variants for two different call-site needs:
//  - getCurrentUser(): nullable, for pages/routes that want to branch on
//    logged-out state themselves (e.g. cart/checkout showing a prompt).
//  - requireCurrentUser(redirectTo): throws via redirect() to /login if any
//    step fails, for pages that have no sensible logged-out rendering at all
//    (e.g. order history).
// Both resolve the same way: Cognito ID token cookie -> verified `sub` claim
// -> matching `User.cognitoSub` row.

export async function getCurrentUser(): Promise<User | null> {
  return findSessionUser();
}

export async function requireCurrentUser(redirectTo: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }
  return user;
}
