// Starts a Stripe Checkout Session for the buyer's cart.
//
// ─── Stripe Connect / payout approach (documented tradeoff) ───────────────
// The issue scope is "Cart and checkout via Stripe Connect," but a cart can
// span multiple sellers, and Stripe Connect's clean per-seller payment
// splitting (destination charges / `transfer_data`) only works for a
// *single* connected account per charge. Splitting one multi-seller cart
// across N destination charges would mean N separate Checkout
// Sessions/PaymentIntents for what the buyer experiences as one order and
// one card charge — a materially bigger scope than an MVP checkout pass,
// and connected accounts aren't onboarded yet anyway (no seller has a
// Stripe Connect account id — that field doesn't even exist on
// SellerProfile yet).
//
// For this pass we do the simpler thing and say so explicitly: ONE Stripe
// Checkout Session per order, charged entirely to the platform's own Stripe
// account (no `transfer_data`/`application_fee_amount`, no connected
// accounts involved). Seller payout is NOT automated here — it's a
// documented follow-up (Stripe Connect Express accounts + either scheduled
// transfers or the "separate charges and transfers" pattern once sellers
// have onboarded). This keeps a single buyer-facing Order/charge while
// deferring the harder multi-account money-movement problem instead of
// silently half-implementing it.
//
// Buyers are charged the item price plus the seller's shipping amount.
// UpSycle does not add a buyer service fee on top of that.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { getStripeClient } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site-url";
import { listingSubscriptionSelect, sellerListingsArePublic } from "@/lib/public-catalog";
import { orderTotalCents, type StoredCartLine } from "@/lib/stored-cart";
import { MAX_CART_LINES, MAX_QUANTITY_PER_LINE, type CheckoutCartItem } from "@/lib/cart";
import { randomIntegrationSuffix } from "@/lib/seller-billing";

interface CheckoutBody {
  items?: CheckoutCartItem[];
  shippingAddressId?: string;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to check out." }, { status: 401 });
  }

  let body: CheckoutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const shippingAddressId = body.shippingAddressId;

  if (items.length === 0) {
    return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  }
  if (items.length > MAX_CART_LINES) {
    return NextResponse.json(
      { error: `A cart can hold at most ${MAX_CART_LINES} items.` },
      { status: 400 },
    );
  }

  const merged = new Map<string, CheckoutCartItem>();
  for (const item of items) {
    if (!item || typeof item.productId !== "string") continue;
    const previous = merged.get(item.productId);
    const quantity = Math.floor(item.quantity) + (previous ? Math.floor(previous.quantity) : 0);
    merged.set(item.productId, {
      productId: item.productId,
      quantity,
      fulfillmentMethod: item.fulfillmentMethod ?? previous?.fulfillmentMethod,
    });
  }
  if (merged.size > MAX_CART_LINES) {
    return NextResponse.json(
      { error: `A cart can hold at most ${MAX_CART_LINES} items.` },
      { status: 400 },
    );
  }

  const productIds = [...merged.keys()];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      sellerProfile: {
        select: { approvalStatus: true, subscription: { select: listingSubscriptionSelect } },
      },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const validatedLines: StoredCartLine[] = [];
  for (const item of merged.values()) {
    const product = byId.get(item.productId);
    const quantity = Math.floor(item.quantity);

    if (!product || !sellerListingsArePublic(product.sellerProfile)) {
      return NextResponse.json(
        { error: "One of the items in your cart is no longer available. Please review your cart." },
        { status: 409 },
      );
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY_PER_LINE) {
      return NextResponse.json({ error: `Invalid quantity for "${product.title}".` }, { status: 400 });
    }
    if (product.inventoryCount < quantity) {
      return NextResponse.json(
        {
          error:
            product.inventoryCount > 0
              ? `Only ${product.inventoryCount} left of "${product.title}" — please reduce the quantity.`
              : `"${product.title}" is out of stock.`,
        },
        { status: 409 },
      );
    }

    const requestedFulfillment = item.fulfillmentMethod === "PICKUP" ? "PICKUP" : "SHIP";
    if (requestedFulfillment === "PICKUP" && !product.offersLocalPickup) {
      return NextResponse.json(
        { error: `Local pickup is not available for "${product.title}".` },
        { status: 400 },
      );
    }

    validatedLines.push({
      productId: product.id,
      quantity,
      unitPriceCents: product.priceCents,
      shippingCostCents: requestedFulfillment === "PICKUP" ? 0 : product.shippingCostCents,
      sellerProfileId: product.sellerProfileId,
      title: product.title,
      fulfillmentMethod: requestedFulfillment,
    });
  }

  const needsAddress = validatedLines.some((l) => l.fulfillmentMethod === "SHIP");
  let address: { id: string } | null = null;
  if (needsAddress) {
    if (!shippingAddressId) {
      return NextResponse.json({ error: "Please select a shipping address." }, { status: 400 });
    }
    address = await prisma.address.findFirst({
      where: { id: shippingAddressId, userId: user.id },
    });
    if (!address) {
      return NextResponse.json({ error: "That shipping address could not be found." }, { status: 400 });
    }
  }

  let siteUrl: string;
  try {
    siteUrl = getSiteUrl();
  } catch (err) {
    console.error("Checkout refused because SITE_URL is not configured", err);
    return NextResponse.json(
      { error: "Payments are temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  const totalAmountCents = orderTotalCents(validatedLines);
  const pending = await prisma.pendingCheckout.create({
    data: {
      buyerId: user.id,
      shippingAddressId: address?.id ?? null,
      totalAmountCents,
      linesJson: validatedLines as unknown as Prisma.InputJsonValue,
    },
  });

  const stripe = getStripeClient();
  const lineItems: Array<{
    price_data: {
      currency: string;
      unit_amount: number;
      product_data: { name: string };
    };
    quantity: number;
  }> = [];

  for (const line of validatedLines) {
    lineItems.push({
      price_data: {
        currency: "usd",
        unit_amount: line.unitPriceCents,
        product_data: { name: line.title },
      },
      quantity: line.quantity,
    });
    if (line.shippingCostCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: line.shippingCostCents,
          product_data: { name: `Shipping — ${line.title}` },
        },
        quantity: 1,
      });
    }
  }

  // Only the pending-checkout id goes in metadata. The cart itself is the
  // PendingCheckout row, which is not limited to Stripe's 500-character cap.
  const metadata = { kind: "cart", pendingCheckoutId: pending.id };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      integration_identifier: `upsycle_cart_${randomIntegrationSuffix()}`,
      customer_email: user.email,
      line_items: lineItems,
      metadata,
      payment_intent_data: { metadata },
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout Session URL.");
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Failed to create Stripe Checkout Session:", err);
    return NextResponse.json(
      { error: "Payments are temporarily unavailable. Please try again shortly." },
      { status: 502 },
    );
  }
}
