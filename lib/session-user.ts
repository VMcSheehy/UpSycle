import { prisma } from "@/lib/prisma";
import { getIdToken } from "@/lib/session";
import { verifyIdToken } from "@/lib/verify-token";

// One place that turns the session cookie into a Cognito subject. Admin
// checks, buyer pages, and seller checks all start here. Roles live on the
// Postgres UserRole rows, not in Cognito groups.

export interface SessionIdentity {
  cognitoSub: string;
  email?: string;
}

export async function readSessionIdentity(): Promise<SessionIdentity | null> {
  const idToken = await getIdToken();
  if (!idToken) return null;

  try {
    const claims = await verifyIdToken(idToken);
    if (typeof claims.sub !== "string" || !claims.sub) return null;
    return {
      cognitoSub: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
    };
  } catch {
    return null;
  }
}

export async function findSessionUser() {
  const identity = await readSessionIdentity();
  if (!identity) return null;
  return prisma.user.findUnique({ where: { cognitoSub: identity.cognitoSub } });
}

export async function findSessionUserWithRoles() {
  const identity = await readSessionIdentity();
  if (!identity) return null;
  return prisma.user.findUnique({
    where: { cognitoSub: identity.cognitoSub },
    include: { roles: true },
  });
}

export async function findSessionUserWithSeller() {
  const identity = await readSessionIdentity();
  if (!identity) return null;
  const user = await prisma.user.findUnique({
    where: { cognitoSub: identity.cognitoSub },
    include: { sellerProfile: true },
  });
  if (!user) return null;
  return { identity, user };
}
