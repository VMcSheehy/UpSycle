import { logError, logWarning } from "@/lib/log";
import { dollarsToCents } from "@/lib/shipping";
import { providerCarrierCode, type ShippingCarrier } from "@/lib/tracking";

export interface RegisteredTracker {
  trackerId: string | null;
  publicUrl: string | null;
  status: string | null;
  statusDetail: string | null;
}

export interface QuotedRate {
  id: string;
  shipmentId: string;
  carrier: string;
  service: string;
  labelCostCents: number;
  deliveryDays: number | null;
}

export interface PurchasedLabel {
  trackingNumber: string;
  labelUrl: string;
  labelCostCents: number;
  publicUrl: string | null;
}

export interface QuoteAddress {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  email?: string | null;
  phone?: string | null;
}

export interface QuoteParcel {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightOz: number;
}

export interface TrackingProvider {
  readonly name: string;
  register(input: { carrier: ShippingCarrier; trackingNumber: string }): Promise<RegisteredTracker | null>;
  quoteShipment(input: { from: QuoteAddress; to: QuoteAddress; parcel: QuoteParcel }): Promise<{
    shipmentId: string;
    rates: QuotedRate[];
  } | null>;
  buyLabel(input: {
    shipmentId: string;
    rateId: string;
    insuranceDollars?: string | null;
  }): Promise<PurchasedLabel | null>;
}

interface EasyPostTracker {
  id?: string;
  public_url?: string | null;
  status?: string | null;
  status_detail?: string | null;
}

// EasyPost is the default. A seller's own USPS, UPS, FedEx, or DHL number is
// registered as a tracker, and later scans arrive on the webhook. Shippo can
// sit behind TrackingProvider later; this build does not call it.
class EasyPostTrackingProvider implements TrackingProvider {
  readonly name = "easypost";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`;
  }

  async register(input: { carrier: ShippingCarrier; trackingNumber: string }): Promise<RegisteredTracker | null> {
    try {
      const response = await this.fetchImpl("https://api.easypost.com/v2/trackers", {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tracker: {
            tracking_code: input.trackingNumber,
            carrier: providerCarrierCode(input.carrier),
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        logWarning("tracking.register_failed", { provider: this.name, status: response.status });
        return null;
      }
      const body = (await response.json()) as EasyPostTracker;
      return {
        trackerId: body.id ?? null,
        publicUrl: body.public_url ?? null,
        status: body.status ?? null,
        statusDetail: body.status_detail ?? null,
      };
    } catch (err) {
      logError("tracking.register_failed", err, { provider: this.name });
      return null;
    }
  }

  async quoteShipment(input: {
    from: QuoteAddress;
    to: QuoteAddress;
    parcel: QuoteParcel;
  }): Promise<{ shipmentId: string; rates: QuotedRate[] } | null> {
    try {
      const response = await this.fetchImpl("https://api.easypost.com/v2/shipments", {
        method: "POST",
        headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment: {
            from_address: toEasyPostAddress(input.from),
            to_address: toEasyPostAddress(input.to),
            parcel: {
              length: input.parcel.lengthIn,
              width: input.parcel.widthIn,
              height: input.parcel.heightIn,
              weight: input.parcel.weightOz,
            },
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        logWarning("shipping.quote_failed", { provider: this.name, status: response.status });
        return null;
      }
      const body = (await response.json()) as {
        id?: string;
        rates?: Array<{ id?: string; carrier?: string; service?: string; rate?: string; delivery_days?: number | null }>;
      };
      if (!body.id || !body.rates?.length) return null;
      const rates: QuotedRate[] = [];
      for (const rate of body.rates) {
        if (!rate.id || !rate.carrier || !rate.service || rate.rate == null) continue;
        rates.push({
          id: rate.id,
          shipmentId: body.id,
          carrier: rate.carrier,
          service: rate.service,
          labelCostCents: dollarsToCents(rate.rate),
          deliveryDays: rate.delivery_days ?? null,
        });
      }
      return rates.length > 0 ? { shipmentId: body.id, rates } : null;
    } catch (err) {
      logError("shipping.quote_failed", err, { provider: this.name });
      return null;
    }
  }

  async buyLabel(input: {
    shipmentId: string;
    rateId: string;
    insuranceDollars?: string | null;
  }): Promise<PurchasedLabel | null> {
    try {
      const response = await this.fetchImpl(`https://api.easypost.com/v2/shipments/${input.shipmentId}/buy`, {
        method: "POST",
        headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          rate: { id: input.rateId },
          ...(input.insuranceDollars ? { insurance: input.insuranceDollars } : {}),
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) {
        logWarning("shipping.buy_failed", { provider: this.name, status: response.status });
        return null;
      }
      const body = (await response.json()) as {
        tracking_code?: string;
        postage_label?: { label_url?: string; label_pdf_url?: string };
        selected_rate?: { rate?: string };
        tracker?: { public_url?: string | null };
      };
      const labelUrl = body.postage_label?.label_pdf_url || body.postage_label?.label_url;
      if (!body.tracking_code || !labelUrl) return null;
      return {
        trackingNumber: body.tracking_code,
        labelUrl,
        labelCostCents: body.selected_rate?.rate != null ? dollarsToCents(body.selected_rate.rate) : 0,
        publicUrl: body.tracker?.public_url ?? null,
      };
    } catch (err) {
      logError("shipping.buy_failed", err, { provider: this.name });
      return null;
    }
  }
}

function toEasyPostAddress(address: QuoteAddress) {
  return {
    name: address.name,
    street1: address.line1,
    street2: address.line2 || undefined,
    city: address.city,
    state: address.state,
    zip: address.postalCode,
    country: address.country || "US",
    email: address.email || undefined,
    phone: address.phone || undefined,
  };
}

export function createEasyPostProvider(apiKey: string, fetchImpl?: typeof fetch): TrackingProvider {
  return new EasyPostTrackingProvider(apiKey, fetchImpl);
}

export function getTrackingProvider(): TrackingProvider | null {
  const selected = (process.env.TRACKING_PROVIDER || "easypost").trim().toLowerCase();
  if (selected !== "easypost") {
    logWarning("tracking.provider_unavailable", { provider: selected });
    return null;
  }
  const apiKey = process.env.EASYPOST_API_KEY?.trim();
  if (!apiKey) {
    logWarning("tracking.unconfigured", { provider: "easypost", missing: "EASYPOST_API_KEY" });
    return null;
  }
  return new EasyPostTrackingProvider(apiKey);
}

export function trackingWebhookSecret(): string | null {
  const secret = process.env.EASYPOST_WEBHOOK_SECRET?.trim();
  if (!secret) {
    logWarning("tracking.unconfigured", { provider: "easypost", missing: "EASYPOST_WEBHOOK_SECRET" });
    return null;
  }
  return secret;
}
