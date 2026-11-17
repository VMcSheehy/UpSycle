// Lets an approved seller edit their own storefront "story" paragraph after
// signup (SellerProfile.story — see prisma/schema.prisma). Tier is not
// writable here. Only an admin, or a future billing flow, may change it.
//
// Cannot be statically rendered — it reads the session and writes to
// Postgres on every request.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { resolveSellerAuth, sellerAuthErrorResponse } from "@/lib/seller-auth";
import { MAX_STORY_LENGTH } from "@/lib/validation/sellerSignup";

export async function PATCH(request: NextRequest) {
  const auth = await resolveSellerAuth();
  if (!auth.ok) {
    return sellerAuthErrorResponse(auth.failure);
  }

  let body: { story?: string };
  try {
    body = (await request.json()) as { story?: string };
  } catch {
    return NextResponse.json({ errors: ["Request body must be valid JSON."] }, { status: 400 });
  }

  if (body.story === undefined) {
    const current = await prisma.sellerProfile.findUniqueOrThrow({
      where: { id: auth.seller.sellerProfileId },
      select: { story: true, tier: true },
    });
    return NextResponse.json({ story: current.story, tier: current.tier });
  }

  const story = body.story.trim();
  if (story.length > MAX_STORY_LENGTH) {
    return NextResponse.json(
      { errors: [`Your story must be ${MAX_STORY_LENGTH} characters or fewer.`] },
      { status: 400 },
    );
  }

  const sellerProfile = await prisma.sellerProfile.update({
    where: { id: auth.seller.sellerProfileId },
    data: { story: story || null },
  });

  return NextResponse.json({ story: sellerProfile.story, tier: sellerProfile.tier });
}
