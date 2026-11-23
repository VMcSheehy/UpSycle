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
import { shipFromReady } from "@/lib/shipping";
import { MAX_STORY_LENGTH } from "@/lib/validation/sellerSignup";

export async function PATCH(request: NextRequest) {
  const auth = await resolveSellerAuth();
  if (!auth.ok) {
    return sellerAuthErrorResponse(auth.failure);
  }

  let body: {
    story?: string;
    shipFrom?: {
      name?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: ["Request body must be valid JSON."] }, { status: 400 });
  }

  if (body.shipFrom) {
    const shipFrom = {
      line1: body.shipFrom.line1?.trim() ?? "",
      city: body.shipFrom.city?.trim() ?? "",
      state: body.shipFrom.state?.trim().toUpperCase() ?? "",
      postalCode: body.shipFrom.postalCode?.trim() ?? "",
    };
    if (!shipFromReady(shipFrom) || shipFrom.state.length !== 2) {
      return NextResponse.json(
        { errors: ["Enter a street, city, two-letter state, and ZIP code."] },
        { status: 400 },
      );
    }
    const sellerProfile = await prisma.sellerProfile.update({
      where: { id: auth.seller.sellerProfileId },
      data: {
        shipFromName: body.shipFrom.name?.trim() || null,
        shipFromLine1: shipFrom.line1,
        shipFromLine2: body.shipFrom.line2?.trim() || null,
        shipFromCity: shipFrom.city,
        shipFromState: shipFrom.state,
        shipFromPostalCode: shipFrom.postalCode,
        shipFromCountry: "US",
      },
    });
    return NextResponse.json({ shipFrom: sellerProfile.shipFromLine1, tier: sellerProfile.tier });
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
