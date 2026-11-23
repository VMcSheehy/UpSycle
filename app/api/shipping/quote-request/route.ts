// A buyer asks the seller for a freight quote. The request is stored even
// when email is not configured.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { sendTextEmail } from "@/lib/order-email";
import { prisma } from "@/lib/prisma";

interface QuoteRequestBody {
  productId?: string;
  buyerName?: string;
  buyerEmail?: string;
  postalCode?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: QuoteRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const buyerName = body.buyerName?.trim() ?? "";
  const buyerEmail = body.buyerEmail?.trim() ?? "";
  const postalCode = body.postalCode?.trim() ?? "";
  const message = body.message?.trim() || null;
  if (!buyerName || !EMAIL_RE.test(buyerEmail) || !/^\d{5}(-\d{4})?$/.test(postalCode)) {
    return NextResponse.json({ error: "Enter your name, email, and ZIP code." }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: body.productId },
    include: { sellerProfile: { include: { user: { select: { email: true } } } } },
  });
  if (!product || !product.needsFreightQuote) {
    return NextResponse.json({ error: "That listing does not take freight quotes." }, { status: 404 });
  }

  await prisma.shippingQuoteRequest.create({
    data: {
      productId: product.id,
      sellerProfileId: product.sellerProfileId,
      buyerName,
      buyerEmail,
      postalCode,
      message,
    },
  });

  await sendTextEmail({
    to: product.sellerProfile.user.email,
    subject: `Shipping quote requested for ${product.title}`,
    text: `${buyerName} (${buyerEmail}) asked for a freight quote on "${product.title}" to ZIP ${postalCode}.${message ? ` Message: ${message}` : ""}`,
  });

  return NextResponse.json({ ok: true });
}
