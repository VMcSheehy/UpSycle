// Live shipping rates for the signed-in buyer's cart. One EasyPost shipment
// per seller. Without an API key, every seller falls back to the flat rate
// stored on the listing.
export const dynamic = "force-dynamic";

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { sellerDisplayName } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { listingSubscriptionSelect, sellerListingsArePublic } from "@/lib/public-catalog";
import {
  combineParcels,
  insuranceDefaultOn,
  insuranceFeeCents,
  insuranceThresholdCents,
  parseShippingMarkup,
  priceRate,
  shipFromReady,
  shippingSpeed,
  tenthsToInches,
  type ParcelInput,
} from "@/lib/shipping";
import { getTrackingProvider } from "@/lib/tracking-provider";

interface RatesBody {
  items?: Array<{ productId?: string; quantity?: number; fulfillmentMethod?: string }>;
  shippingAddressId?: string;
}

const QUOTE_TTL_MS = 30 * 60 * 1000;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to see shipping rates." }, { status: 401 });

  let body: RatesBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const items = (body.items ?? []).flatMap((item) =>
    item.productId ? [{ productId: item.productId, quantity: Math.max(1, Math.floor(item.quantity ?? 1)), fulfillment: item.fulfillmentMethod === "PICKUP" ? "PICKUP" as const : "SHIP" as const }] : [],
  );
  if (items.length === 0) return NextResponse.json({ calculated: false, sellers: [] });

  const address = body.shippingAddressId
    ? await prisma.address.findFirst({ where: { id: body.shippingAddressId, userId: user.id } })
    : null;
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
    include: {
      sellerProfile: {
        include: {
          subscription: { select: listingSubscriptionSelect },
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const provider = getTrackingProvider();
  const markup = parseShippingMarkup(process.env.SHIPPING_MARKUP);
  const threshold = insuranceThresholdCents();
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product || item.fulfillment !== "SHIP" || !sellerListingsArePublic(product.sellerProfile)) continue;
    const group = groups.get(product.sellerProfileId) ?? [];
    group.push(item);
    groups.set(product.sellerProfileId, group);
  }

  const sellers = [];
  for (const [sellerProfileId, group] of groups) {
    const first = byId.get(group[0]!.productId)!;
    const sellerName = sellerDisplayName(first.sellerProfile);
    const merchandiseCents = group.reduce((sum, item) => sum + (byId.get(item.productId)?.priceCents ?? 0) * item.quantity, 0);
    const flatCents = group.reduce((sum, item) => sum + (byId.get(item.productId)?.shippingCostCents ?? 0), 0);
    if (group.some((item) => byId.get(item.productId)?.needsFreightQuote)) {
      sellers.push({ sellerProfileId, sellerName, mode: "freight" as const, merchandiseCents, flatCents });
      continue;
    }

    const parcels: ParcelInput[] = [];
    let parcelReady = true;
    for (const item of group) {
      const product = byId.get(item.productId)!;
      const lengthIn = tenthsToInches(product.parcelLengthTenths);
      const widthIn = tenthsToInches(product.parcelWidthTenths);
      const heightIn = tenthsToInches(product.parcelHeightTenths);
      const weightOz = tenthsToInches(product.parcelWeightTenths);
      if (lengthIn == null || widthIn == null || heightIn == null || weightOz == null) {
        parcelReady = false;
        break;
      }
      parcels.push({ lengthIn, widthIn, heightIn, weightOz, quantity: item.quantity });
    }
    const parcel = parcelReady ? combineParcels(parcels) : null;
    const from = first.sellerProfile;
    const canQuote = Boolean(
      provider &&
        address &&
        parcel &&
        shipFromReady({
          line1: from.shipFromLine1 ?? "",
          city: from.shipFromCity ?? "",
          state: from.shipFromState ?? "",
          postalCode: from.shipFromPostalCode ?? "",
        }),
    );

    if (!canQuote || !provider || !address || !parcel) {
      sellers.push({
        sellerProfileId,
        sellerName,
        mode: "flat" as const,
        merchandiseCents,
        flatCents,
        insuranceDefault: false,
        insuranceFeeCents: 0,
        rates: [],
      });
      continue;
    }

    const quoted = await provider.quoteShipment({
      from: {
        name: from.shipFromName || sellerName,
        line1: from.shipFromLine1!,
        line2: from.shipFromLine2,
        city: from.shipFromCity!,
        state: from.shipFromState!,
        postalCode: from.shipFromPostalCode!,
        country: from.shipFromCountry || "US",
      },
      to: {
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country || "US",
        email: user.email,
      },
      parcel,
    });
    if (!quoted) {
      sellers.push({
        sellerProfileId,
        sellerName,
        mode: "flat" as const,
        merchandiseCents,
        flatCents,
        insuranceDefault: false,
        insuranceFeeCents: 0,
        rates: [],
      });
      continue;
    }

    await prisma.shippingQuote.create({
      data: {
        buyerId: user.id,
        sellerProfileId,
        easypostShipmentId: quoted.shipmentId,
        merchandiseCents,
        expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
        ratesJson: quoted.rates as unknown as Prisma.InputJsonValue,
      },
    });

    const insuranceOn = insuranceDefaultOn(merchandiseCents, threshold);
    sellers.push({
      sellerProfileId,
      sellerName,
      mode: "calculated" as const,
      merchandiseCents,
      flatCents,
      insuranceDefault: insuranceOn,
      insuranceFeeCents: insuranceFeeCents(merchandiseCents),
      rates: quoted.rates
        .map((rate) => {
          const priced = priceRate({
            labelCostCents: rate.labelCostCents,
            merchandiseCents,
            insured: false,
            markup,
          });
          return {
            id: rate.id,
            carrier: rate.carrier,
            service: rate.service,
            speed: shippingSpeed(rate.service),
            deliveryDays: rate.deliveryDays,
            labelCostCents: rate.labelCostCents,
            buyerChargeCents: priced.buyerShippingCents,
          };
        })
        .sort((a, b) => a.buyerChargeCents - b.buyerChargeCents),
    });
  }

  return NextResponse.json({
    calculated: sellers.some((seller) => seller.mode === "calculated"),
    sellers,
  });
}
