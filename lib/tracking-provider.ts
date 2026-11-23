import { logError, logWarning } from "@/lib/log";
import { providerCarrierCode, type ShippingCarrier } from "@/lib/tracking";

export interface RegisteredTracker {
  trackerId: string | null;
  publicUrl: string | null;
  status: string | null;
  statusDetail: string | null;
}

export interface TrackingProvider {
  readonly name: string;
  register(input: { carrier: ShippingCarrier; trackingNumber: string }): Promise<RegisteredTracker | null>;
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

  constructor(private readonly apiKey: string) {}

  async register(input: { carrier: ShippingCarrier; trackingNumber: string }): Promise<RegisteredTracker | null> {
    try {
      const response = await fetch("https://api.easypost.com/v2/trackers", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`,
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
