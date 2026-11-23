import { createHmac, timingSafeEqual } from "node:crypto";

import type { LineStatus } from "@/lib/order-status";

export const CARRIERS = ["USPS", "UPS", "FEDEX", "DHL"] as const;
export type ShippingCarrier = (typeof CARRIERS)[number];

export function normalizeTrackingNumber(value: string): string {
  return value.replace(/[\s-]+/g, "").toUpperCase();
}

export function parseCarrier(value: unknown): ShippingCarrier | null {
  if (typeof value !== "string") return null;
  const carrier = value.trim().toUpperCase();
  return CARRIERS.includes(carrier as ShippingCarrier) ? (carrier as ShippingCarrier) : null;
}

// EasyPost uses DHLExpress for the DHL Express waybill. DHL eCommerce numbers
// are a different product; sellers pick DHL and we register them as Express.
export function providerCarrierCode(carrier: ShippingCarrier): string {
  if (carrier === "DHL") return "DHLExpress";
  if (carrier === "FEDEX") return "FedEx";
  return carrier;
}

export function carrierFromProvider(value: string | null | undefined): ShippingCarrier | null {
  const code = value?.trim().toLowerCase();
  if (!code) return null;
  if (code === "usps") return "USPS";
  if (code === "ups") return "UPS";
  if (code === "fedex") return "FEDEX";
  if (code === "dhlexpress" || code === "dhlecommerce" || code === "dhl") return "DHL";
  return null;
}

const CARRIER_PATTERNS: Record<ShippingCarrier, RegExp> = {
  // 20/22/26/30/34-digit IMpb, or the 13-character international form.
  USPS: /^(?:\d{20}|\d{22}|\d{26}|\d{30}|\d{34}|[A-Z]{2}\d{9}[A-Z]{2})$/,
  // 1Z plus 16 characters, or an 18-digit Mail Innovations number.
  UPS: /^(?:1Z[0-9A-Z]{16}|\d{18})$/,
  // Express 12, Ground 15, and the longer door-tag and SmartPost forms.
  FEDEX: /^(?:\d{12}|\d{15}|\d{20}|\d{22})$/,
  // Express waybill, or the longer piece id.
  DHL: /^(?:\d{10,11}|\d{20,22})$/,
};

export function trackingNumberError(carrier: ShippingCarrier, trackingNumber: string): string | null {
  const normalized = normalizeTrackingNumber(trackingNumber);
  if (!normalized) return "Enter a tracking number.";
  if (!CARRIER_PATTERNS[carrier].test(normalized)) {
    return `That does not look like a ${carrier} tracking number.`;
  }
  return null;
}

export function carrierTrackingUrl(carrier: ShippingCarrier, trackingNumber: string): string {
  const number = encodeURIComponent(normalizeTrackingNumber(trackingNumber));
  switch (carrier) {
    case "USPS":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`;
    case "UPS":
      return `https://www.ups.com/track?tracknum=${number}`;
    case "FEDEX":
      return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
    case "DHL":
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${number}`;
  }
}

const EXCEPTION_DETAILS = new Set([
  "damaged",
  "lost",
  "failure",
  "delivery_exception",
  "held",
  "refused",
  "return",
  "transit_exception",
  "expired",
  "cancelled",
]);

export function mapCarrierStatus(status: string | null | undefined, detail?: string | null): LineStatus | null {
  if (detail && EXCEPTION_DETAILS.has(detail)) return "EXCEPTION";
  switch (status) {
    case "pre_transit":
    case "unknown":
      return "SHIPPED";
    case "in_transit":
      return "IN_TRANSIT";
    case "out_for_delivery":
    case "available_for_pickup":
      return "OUT_FOR_DELIVERY";
    case "delivered":
      return "DELIVERED";
    case "return_to_sender":
    case "failure":
    case "error":
    case "cancelled":
      return "EXCEPTION";
    default:
      return null;
  }
}

const RANK: Record<LineStatus, number> = {
  PENDING_SHIPMENT: 0,
  SHIPPED: 1,
  IN_TRANSIT: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  EXCEPTION: 4,
  CANCELLED: 5,
};

export type TrackingEmail = "delivered" | "exception";

export function decideTrackingUpdate(input: {
  current: LineStatus;
  carrierStatus: string | null | undefined;
  statusDetail?: string | null;
}): { status: LineStatus; email: TrackingEmail | null } | { ignore: true } {
  if (input.current === "CANCELLED" || input.current === "DELIVERED") return { ignore: true };
  const mapped = mapCarrierStatus(input.carrierStatus, input.statusDetail);
  if (!mapped || mapped === "PENDING_SHIPMENT") return { ignore: true };
  if (mapped === "EXCEPTION") {
    if (input.current === "EXCEPTION") return { ignore: true };
    return { status: "EXCEPTION", email: "exception" };
  }
  if (RANK[mapped] < RANK[input.current]) return { ignore: true };
  if (mapped === input.current) return { ignore: true };
  return { status: mapped, email: mapped === "DELIVERED" ? "delivered" : null };
}

export function planTrackingAddition(input: {
  fulfillment: "SHIP" | "PICKUP";
  current: LineStatus;
  alreadyHasTracking: boolean;
  carrier: unknown;
  trackingNumber: unknown;
  providerStatus?: string | null;
  providerDetail?: string | null;
}):
  | { ok: false; status: 400 | 409; error: string }
  | {
      ok: true;
      carrier: ShippingCarrier;
      trackingNumber: string;
      trackingUrl: string;
      nextStatus: LineStatus;
    } {
  if (input.fulfillment !== "SHIP") {
    return { ok: false, status: 400, error: "Pickup orders do not use a carrier tracking number." };
  }
  if (input.current === "CANCELLED" || input.current === "DELIVERED") {
    return { ok: false, status: 409, error: "Tracking cannot be added to this item." };
  }
  if (input.alreadyHasTracking) {
    return { ok: false, status: 409, error: "This item already has a tracking number." };
  }
  const carrier = parseCarrier(input.carrier);
  if (!carrier) return { ok: false, status: 400, error: "Choose USPS, UPS, FedEx, or DHL." };
  if (typeof input.trackingNumber !== "string") {
    return { ok: false, status: 400, error: "Enter a tracking number." };
  }
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
  const numberError = trackingNumberError(carrier, trackingNumber);
  if (numberError) return { ok: false, status: 400, error: numberError };

  const mapped = mapCarrierStatus(input.providerStatus, input.providerDetail);
  const nextStatus: LineStatus = mapped && RANK[mapped] > RANK.SHIPPED ? mapped : "SHIPPED";
  return {
    ok: true,
    carrier,
    trackingNumber,
    trackingUrl: carrierTrackingUrl(carrier, trackingNumber),
    nextStatus: input.current === "PENDING_SHIPMENT" || RANK[nextStatus] >= RANK[input.current] ? nextStatus : input.current,
  };
}

export interface TrackingSignatureInput {
  rawBody: string;
  signatureHeader: string | null;
  signatureV2Header: string | null;
  timestampHeader: string | null;
  pathHeader: string | null;
  secret: string;
  now?: number;
}

const PAST_TOLERANCE_MS = 60_000;
const FUTURE_TOLERANCE_MS = 30_000;

export function easyPostSignature(secret: string, payload: string): string {
  const key = Buffer.from(secret.normalize("NFKD"), "utf8");
  return `hmac-sha256-hex=${createHmac("sha256", key).update(payload, "utf8").digest("hex")}`;
}

function signaturesMatch(expected: string, received: string): boolean {
  const left = Buffer.from(expected.toLowerCase());
  const right = Buffer.from(received.trim().toLowerCase());
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function timestampIsFresh(value: string, now: number): boolean {
  const sent = Date.parse(value);
  if (Number.isNaN(sent)) return false;
  if (sent - now > FUTURE_TOLERANCE_MS) return false;
  if (now - sent > PAST_TOLERANCE_MS) return false;
  return true;
}

// EasyPost signs the raw body. The v2 header also binds the timestamp, method,
// and path so an old body cannot be replayed. The classic header is accepted
// when v2 headers are absent, which is what their client libraries still send.
export function verifyTrackingSignature(input: TrackingSignatureInput): boolean {
  if (!input.secret) return false;
  const now = input.now ?? Date.now();
  if (input.signatureV2Header && input.timestampHeader && input.pathHeader) {
    if (!timestampIsFresh(input.timestampHeader, now)) return false;
    const payload = `${input.timestampHeader}POST${input.pathHeader}${input.rawBody}`;
    return signaturesMatch(easyPostSignature(input.secret, payload), input.signatureV2Header);
  }
  if (!input.signatureHeader) return false;
  return signaturesMatch(easyPostSignature(input.secret, input.rawBody), input.signatureHeader);
}
