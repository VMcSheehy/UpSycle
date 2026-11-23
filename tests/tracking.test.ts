import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { aggregateOrderStatus } from "@/lib/order-status";
import { orderEmailContent } from "@/lib/order-email-content";
import {
  carrierTrackingUrl,
  decideTrackingUpdate,
  easyPostSignature,
  planTrackingAddition,
  trackingNumberError,
  verifyTrackingSignature,
} from "@/lib/tracking";
import { getTrackingProvider } from "@/lib/tracking-provider";

describe("carrier tracking numbers", () => {
  it("accepts a normal number for each carrier and rejects a mismatched one", () => {
    expect(trackingNumberError("USPS", "9400 1118 9922 3344 5566 77")).toBeNull();
    expect(trackingNumberError("USPS", "EA123456789US")).toBeNull();
    expect(trackingNumberError("UPS", "1Z999AA10123456784")).toBeNull();
    expect(trackingNumberError("FEDEX", "123456789012")).toBeNull();
    expect(trackingNumberError("DHL", "1234567890")).toBeNull();
    expect(trackingNumberError("UPS", "123456789012")).not.toBeNull();
    expect(trackingNumberError("FEDEX", "not-a-number")).not.toBeNull();
  });

  it("builds a carrier tracking page without a provider account", () => {
    expect(carrierTrackingUrl("USPS", "9400111899223344556677")).toContain("usps.com");
    expect(carrierTrackingUrl("UPS", "1Z999AA10123456784")).toContain("ups.com");
    expect(carrierTrackingUrl("FEDEX", "123456789012")).toContain("fedex.com");
    expect(carrierTrackingUrl("DHL", "1234567890")).toContain("dhl.com");
  });
});

describe("adding a tracking number", () => {
  it("marks the line shipped and keeps the carrier link", () => {
    const plan = planTrackingAddition({
      fulfillment: "SHIP",
      current: "PENDING_SHIPMENT",
      alreadyHasTracking: false,
      carrier: "usps",
      trackingNumber: "9400 1118 9922 3344 5566 77",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.nextStatus).toBe("SHIPPED");
    expect(plan.trackingNumber).toBe("9400111899223344556677");
    expect(plan.trackingUrl).toContain("9400111899223344556677");
  });

  it("moves straight to delivered when the carrier already says so", () => {
    const plan = planTrackingAddition({
      fulfillment: "SHIP",
      current: "PENDING_SHIPMENT",
      alreadyHasTracking: false,
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      providerStatus: "delivered",
    });
    expect(plan.ok && plan.nextStatus).toBe("DELIVERED");
  });

  it("refuses pickup and a second number", () => {
    expect(
      planTrackingAddition({
        fulfillment: "PICKUP",
        current: "PENDING_SHIPMENT",
        alreadyHasTracking: false,
        carrier: "USPS",
        trackingNumber: "9400111899223344556677",
      }).ok,
    ).toBe(false);
    expect(
      planTrackingAddition({
        fulfillment: "SHIP",
        current: "SHIPPED",
        alreadyHasTracking: true,
        carrier: "USPS",
        trackingNumber: "9400111899223344556677",
      }).ok,
    ).toBe(false);
  });
});

describe("carrier status updates", () => {
  it("advances in transit and out for delivery without emailing, then emails delivery and problems", () => {
    expect(decideTrackingUpdate({ current: "SHIPPED", carrierStatus: "in_transit" })).toEqual({
      status: "IN_TRANSIT",
      email: null,
    });
    expect(decideTrackingUpdate({ current: "IN_TRANSIT", carrierStatus: "out_for_delivery" })).toEqual({
      status: "OUT_FOR_DELIVERY",
      email: null,
    });
    expect(decideTrackingUpdate({ current: "OUT_FOR_DELIVERY", carrierStatus: "delivered" })).toEqual({
      status: "DELIVERED",
      email: "delivered",
    });
    expect(
      decideTrackingUpdate({ current: "IN_TRANSIT", carrierStatus: "in_transit", statusDetail: "damaged" }),
    ).toEqual({ status: "EXCEPTION", email: "exception" });
  });

  it("does not move a delivered or cancelled line backward, or email the same state twice", () => {
    expect(decideTrackingUpdate({ current: "DELIVERED", carrierStatus: "in_transit" })).toEqual({ ignore: true });
    expect(decideTrackingUpdate({ current: "CANCELLED", carrierStatus: "delivered" })).toEqual({ ignore: true });
    expect(decideTrackingUpdate({ current: "IN_TRANSIT", carrierStatus: "in_transit" })).toEqual({ ignore: true });
    expect(decideTrackingUpdate({ current: "EXCEPTION", carrierStatus: "failure" })).toEqual({ ignore: true });
  });

  it("rolls the order up from the lines", () => {
    expect(aggregateOrderStatus(["DELIVERED", "IN_TRANSIT"])).toBe("IN_TRANSIT");
    expect(aggregateOrderStatus(["DELIVERED", "OUT_FOR_DELIVERY"])).toBe("OUT_FOR_DELIVERY");
    expect(aggregateOrderStatus(["DELIVERED", "EXCEPTION"])).toBe("EXCEPTION");
    expect(aggregateOrderStatus(["DELIVERED", "CANCELLED"])).toBe("DELIVERED");
    expect(aggregateOrderStatus(["PENDING_SHIPMENT", "EXCEPTION"])).toBe("PENDING_SHIPMENT");
  });
});

describe("EasyPost webhook signature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", description: "tracker.updated" });

  it("accepts the classic body signature and rejects a tampered body", () => {
    const signature = easyPostSignature(secret, body);
    expect(
      verifyTrackingSignature({
        rawBody: body,
        signatureHeader: signature,
        signatureV2Header: null,
        timestampHeader: null,
        pathHeader: null,
        secret,
      }),
    ).toBe(true);
    expect(
      verifyTrackingSignature({
        rawBody: body + " ",
        signatureHeader: signature,
        signatureV2Header: null,
        timestampHeader: null,
        pathHeader: null,
        secret,
      }),
    ).toBe(false);
  });

  it("accepts a fresh v2 signature and rejects a replay", () => {
    const now = Date.parse("Tue, 19 Aug 2025 20:37:09 -0000");
    const timestamp = "Tue, 19 Aug 2025 20:37:09 -0000";
    const path = "/api/webhooks/tracking";
    const payload = `${timestamp}POST${path}${body}`;
    const signature = `hmac-sha256-hex=${createHmac("sha256", Buffer.from(secret.normalize("NFKD"), "utf8"))
      .update(payload, "utf8")
      .digest("hex")}`;
    const headers = {
      rawBody: body,
      signatureHeader: null,
      signatureV2Header: signature,
      timestampHeader: timestamp,
      pathHeader: path,
      secret,
    };
    expect(verifyTrackingSignature({ ...headers, now })).toBe(true);
    expect(verifyTrackingSignature({ ...headers, now: now + 5 * 60_000 })).toBe(false);
  });
});

describe("missing tracking account", () => {
  it("does not call a provider when the API key is unset", () => {
    const previousKey = process.env.EASYPOST_API_KEY;
    const previousProvider = process.env.TRACKING_PROVIDER;
    delete process.env.EASYPOST_API_KEY;
    process.env.TRACKING_PROVIDER = "easypost";
    expect(getTrackingProvider()).toBeNull();
    if (previousKey === undefined) delete process.env.EASYPOST_API_KEY;
    else process.env.EASYPOST_API_KEY = previousKey;
    if (previousProvider === undefined) delete process.env.TRACKING_PROVIDER;
    else process.env.TRACKING_PROVIDER = previousProvider;
  });
});

describe("shipped email", () => {
  it("uses the requested subject and includes the tracking link", () => {
    const content = orderEmailContent({
      kind: "shipped",
      orderId: "order-12345678",
      productTitle: "Bowl",
      trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223344556677",
    });
    expect(content.subject).toBe("Your order shipped");
    expect(content.text).toContain("Bowl");
    expect(content.text).toContain("https://tools.usps.com/go/TrackConfirmAction");
  });
});
