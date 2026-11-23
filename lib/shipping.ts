// Buyer-paid shipping. The carrier rate is marked up by SHIPPING_MARKUP.
// Insurance is optional and passed through at EasyPost's published schedule
// ($0.50 per $100 of coverage, minimum $0.50), not marked up.

export type ShippingSpeed = "ground" | "express";

export type Markup =
  | { kind: "flat"; cents: number }
  | { kind: "percent"; percent: number };

export interface Parcel {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightOz: number;
}

export interface PackagePreset {
  id: string;
  label: string;
  hint: string;
  parcel: Parcel;
}

export const PACKAGE_PRESETS: PackagePreset[] = [
  {
    id: "jewelry-small",
    label: "Small jewelry box",
    hint: "Rings, earrings, and pendants",
    parcel: { lengthIn: 4, widthIn: 4, heightIn: 2, weightOz: 4 },
  },
  {
    id: "jewelry-medium",
    label: "Medium jewelry box",
    hint: "Necklaces and cuffs",
    parcel: { lengthIn: 8, widthIn: 6, heightIn: 3, weightOz: 12 },
  },
  {
    id: "photo-small",
    label: "Small photograph",
    hint: "Matted prints up to 8×10",
    parcel: { lengthIn: 12, widthIn: 10, heightIn: 1, weightOz: 8 },
  },
  {
    id: "photo-medium",
    label: "Medium photograph",
    hint: "Framed photographs",
    parcel: { lengthIn: 20, widthIn: 16, heightIn: 3, weightOz: 48 },
  },
  {
    id: "art-medium",
    label: "Medium framed art",
    hint: "Paintings and drawings",
    parcel: { lengthIn: 24, widthIn: 18, heightIn: 4, weightOz: 80 },
  },
  {
    id: "art-large",
    label: "Large framed art",
    hint: "Larger framed paintings",
    parcel: { lengthIn: 40, widthIn: 30, heightIn: 5, weightOz: 160 },
  },
  {
    id: "glass-double",
    label: "Glass with double box",
    hint: "Glass, ceramic, and other fragile pieces",
    parcel: { lengthIn: 14, widthIn: 14, heightIn: 14, weightOz: 96 },
  },
  {
    id: "wood-small",
    label: "Small woodworking",
    hint: "Boxes, spoons, and small carvings",
    parcel: { lengthIn: 12, widthIn: 8, heightIn: 6, weightOz: 32 },
  },
  {
    id: "wood-large",
    label: "Large woodworking",
    hint: "Boards, stools, and larger carved work",
    parcel: { lengthIn: 28, widthIn: 16, heightIn: 12, weightOz: 240 },
  },
];

export function presetById(id: string | null | undefined): PackagePreset | null {
  if (!id) return null;
  return PACKAGE_PRESETS.find((preset) => preset.id === id) ?? null;
}

const MAX_INCHES = 108;
const MAX_OUNCES = 1120;

export function parseShippingMarkup(raw: string | undefined | null): Markup {
  const text = (raw ?? "").trim();
  if (!text || text === "0") return { kind: "flat", cents: 0 };
  if (text.endsWith("%")) {
    const percent = Number(text.slice(0, -1).trim());
    if (!Number.isFinite(percent) || percent < 0) return { kind: "flat", cents: 0 };
    return { kind: "percent", percent };
  }
  const cents = Number(text);
  if (!Number.isInteger(cents) || cents < 0) return { kind: "flat", cents: 0 };
  return { kind: "flat", cents };
}

export function markupCents(labelCostCents: number, markup: Markup): number {
  if (labelCostCents < 0) return 0;
  if (markup.kind === "percent") {
    return Math.round((labelCostCents * markup.percent) / 100);
  }
  return markup.cents;
}

export function insuranceThresholdCents(): number {
  const raw = Number(process.env.INSURANCE_THRESHOLD_CENTS ?? "50000");
  if (!Number.isInteger(raw) || raw < 0) return 50000;
  return raw;
}

export function insuranceDefaultOn(merchandiseCents: number, thresholdCents = insuranceThresholdCents()): boolean {
  return merchandiseCents >= thresholdCents;
}

/** EasyPost's published insurance schedule: $0.50 per $100, minimum $0.50. */
export function insuranceFeeCents(coverageCents: number): number {
  if (coverageCents <= 0) return 0;
  const blocks = Math.ceil(coverageCents / 10000);
  return Math.max(50, blocks * 50);
}

export function priceRate(input: {
  labelCostCents: number;
  merchandiseCents: number;
  insured: boolean;
  markup?: Markup;
}): {
  labelCostCents: number;
  buyerShippingCents: number;
  insuranceCents: number;
  buyerChargeCents: number;
  marginCents: number;
} {
  const markup = input.markup ?? parseShippingMarkup(process.env.SHIPPING_MARKUP);
  const margin = markupCents(input.labelCostCents, markup);
  const buyerShippingCents = input.labelCostCents + margin;
  const insuranceCents = input.insured ? insuranceFeeCents(input.merchandiseCents) : 0;
  return {
    labelCostCents: input.labelCostCents,
    buyerShippingCents,
    insuranceCents,
    buyerChargeCents: buyerShippingCents + insuranceCents,
    marginCents: margin,
  };
}

export function shippingSpeed(service: string): ShippingSpeed {
  if (/express|overnight|next.?day|2nd|second|expedited|priority/i.test(service)) return "express";
  return "ground";
}

export function dollarsToCents(amount: string | number): number {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export interface ParcelInput {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightOz: number;
  quantity: number;
}

export function combineParcels(items: ParcelInput[]): Parcel | null {
  if (items.length === 0) return null;
  let lengthIn = 0;
  let widthIn = 0;
  let heightIn = 0;
  let weightOz = 0;
  for (const item of items) {
    if (item.lengthIn <= 0 || item.widthIn <= 0 || item.heightIn <= 0 || item.weightOz <= 0 || item.quantity <= 0) {
      return null;
    }
    lengthIn = Math.max(lengthIn, item.lengthIn);
    widthIn = Math.max(widthIn, item.widthIn);
    heightIn += item.heightIn * item.quantity;
    weightOz += item.weightOz * item.quantity;
  }
  const parcel = {
    lengthIn: roundTenth(lengthIn),
    widthIn: roundTenth(widthIn),
    heightIn: roundTenth(heightIn),
    weightOz: roundTenth(weightOz),
  };
  if (parcel.lengthIn > MAX_INCHES || parcel.widthIn > MAX_INCHES || parcel.heightIn > MAX_INCHES) return null;
  if (parcel.weightOz > MAX_OUNCES) return null;
  return parcel;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function tenthsToInches(tenths: number | null | undefined): number | null {
  if (tenths == null) return null;
  return tenths / 10;
}

export function inchesToTenths(value: number): number {
  return Math.round(value * 10);
}

export function ouncesToGrams(ounces: number): number {
  return Math.round(ounces * 28.3495);
}

export interface ShipFromAddress {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
}

export function shipFromReady(address: Partial<ShipFromAddress> | null | undefined): boolean {
  if (!address) return false;
  return Boolean(
    address.line1?.trim() &&
      address.city?.trim() &&
      address.state?.trim() &&
      /^\d{5}(-\d{4})?$/.test(address.postalCode?.trim() ?? ""),
  );
}

export function allocateCents(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const safeTotal = Math.max(0, totalCents);
  const weightSum = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (weightSum <= 0) {
    const base = Math.floor(safeTotal / weights.length);
    const shares = weights.map(() => base);
    shares[shares.length - 1] += safeTotal - base * weights.length;
    return shares;
  }
  const shares = weights.map((weight) => Math.floor((safeTotal * Math.max(0, weight)) / weightSum));
  const assigned = shares.reduce((sum, share) => sum + share, 0);
  shares[shares.length - 1] += safeTotal - assigned;
  return shares;
}

export interface CheckoutShipmentDraft {
  sellerProfileId: string;
  sellerName: string;
  mode: "calculated" | "flat";
  carrier: string | null;
  service: string | null;
  speed: ShippingSpeed | null;
  easypostShipmentId: string | null;
  easypostRateId: string | null;
  labelCostCents: number;
  buyerShippingCents: number;
  insuranceCents: number;
  buyerChargeCents: number;
  marginCents: number;
  insured: boolean;
}

export function stripeShippingLines(shipments: CheckoutShipmentDraft[]): Array<{ name: string; amountCents: number }> {
  const lines: Array<{ name: string; amountCents: number }> = [];
  for (const shipment of shipments) {
    if (shipment.buyerShippingCents > 0) {
      const how =
        shipment.mode === "flat"
          ? "flat rate"
          : [shipment.carrier, shipment.service].filter(Boolean).join(" ");
      lines.push({
        name: `Shipping — ${shipment.sellerName}${how ? ` (${how})` : ""}`,
        amountCents: shipment.buyerShippingCents,
      });
    }
    if (shipment.insuranceCents > 0) {
      lines.push({
        name: `Shipping insurance — ${shipment.sellerName}`,
        amountCents: shipment.insuranceCents,
      });
    }
  }
  return lines;
}

export interface StoredRate {
  id: string;
  carrier: string;
  service: string;
  labelCostCents: number;
  deliveryDays: number | null;
}

export function cheapestRate<T extends { labelCostCents: number }>(rates: T[]): T | null {
  if (rates.length === 0) return null;
  return [...rates].sort((a, b) => a.labelCostCents - b.labelCostCents)[0] ?? null;
}

export interface CheckoutLineFact {
  productId: string;
  sellerProfileId: string;
  sellerName: string;
  quantity: number;
  unitPriceCents: number;
  flatShippingCents: number;
  fulfillment: "SHIP" | "PICKUP";
  needsFreightQuote: boolean;
}

export interface RateSelection {
  sellerProfileId: string;
  rateId?: string;
  insured?: boolean;
}

export interface SellerQuote {
  sellerProfileId: string;
  easypostShipmentId: string;
  rates: StoredRate[];
}

export function applyCheckoutShipping(input: {
  lines: CheckoutLineFact[];
  selections: RateSelection[];
  quotes: SellerQuote[];
  liveRatesEnabled: boolean;
  markup?: Markup;
}):
  | { ok: true; shippingByProduct: Record<string, number>; shipments: CheckoutShipmentDraft[] }
  | { ok: false; error: string } {
  const markup = input.markup ?? { kind: "flat" as const, cents: 0 };
  const bySeller = new Map<string, CheckoutLineFact[]>();
  for (const line of input.lines) {
    if (line.fulfillment !== "SHIP") continue;
    const group = bySeller.get(line.sellerProfileId) ?? [];
    group.push(line);
    bySeller.set(line.sellerProfileId, group);
  }

  const shippingByProduct: Record<string, number> = {};
  for (const line of input.lines) shippingByProduct[line.productId] = 0;
  const shipments: CheckoutShipmentDraft[] = [];

  for (const [sellerProfileId, group] of bySeller) {
    if (group.some((line) => line.needsFreightQuote)) {
      return {
        ok: false,
        error: "An item in your cart needs a freight quote and cannot be checked out. Request a quote from the listing.",
      };
    }
    const sellerName = group[0]?.sellerName ?? "Seller";
    const merchandiseCents = group.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
    const quote = input.quotes.find((candidate) => candidate.sellerProfileId === sellerProfileId);
    const selection = input.selections.find((candidate) => candidate.sellerProfileId === sellerProfileId);
    const chosen = quote?.rates.find((rate) => rate.id === selection?.rateId);

    if (input.liveRatesEnabled && quote && chosen) {
      const priced = priceRate({
        labelCostCents: chosen.labelCostCents,
        merchandiseCents,
        insured: Boolean(selection?.insured),
        markup,
      });
      const shares = allocateCents(
        priced.buyerChargeCents,
        group.map((line) => line.unitPriceCents * line.quantity),
      );
      group.forEach((line, index) => {
        shippingByProduct[line.productId] = shares[index] ?? 0;
      });
      shipments.push({
        sellerProfileId,
        sellerName,
        mode: "calculated",
        carrier: chosen.carrier,
        service: chosen.service,
        speed: shippingSpeed(chosen.service),
        easypostShipmentId: quote.easypostShipmentId,
        easypostRateId: chosen.id,
        labelCostCents: priced.labelCostCents,
        buyerShippingCents: priced.buyerShippingCents,
        insuranceCents: priced.insuranceCents,
        buyerChargeCents: priced.buyerChargeCents,
        marginCents: priced.marginCents,
        insured: Boolean(selection?.insured),
      });
      continue;
    }

    if (selection?.rateId && !chosen) {
      return { ok: false, error: `Shipping rates for ${sellerName} expired. Choose a speed again.` };
    }
    if (input.liveRatesEnabled && quote && !chosen) {
      return { ok: false, error: `Choose a shipping speed for ${sellerName}.` };
    }

    const flatCents = group.reduce((sum, line) => sum + line.flatShippingCents, 0);
    group.forEach((line) => {
      shippingByProduct[line.productId] = line.flatShippingCents;
    });
    shipments.push({
      sellerProfileId,
      sellerName,
      mode: "flat",
      carrier: null,
      service: null,
      speed: null,
      easypostShipmentId: null,
      easypostRateId: null,
      labelCostCents: flatCents,
      buyerShippingCents: flatCents,
      insuranceCents: 0,
      buyerChargeCents: flatCents,
      marginCents: 0,
      insured: false,
    });
  }

  return { ok: true, shippingByProduct, shipments };
}

export function canBuyLabel(shipment: {
  mode: string;
  easypostShipmentId: string | null;
  easypostRateId: string | null;
  labelUrl: string | null;
} | null): { ok: true; alreadyPurchased: boolean } | { ok: false; error: string } {
  if (!shipment || shipment.mode !== "calculated" || !shipment.easypostShipmentId || !shipment.easypostRateId) {
    return {
      ok: false,
      error: "This order used a flat shipping rate. Add a tracking number instead of buying a label.",
    };
  }
  return { ok: true, alreadyPurchased: Boolean(shipment.labelUrl) };
}
