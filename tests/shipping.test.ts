import { describe, expect, it } from "vitest";

import { orderTotalCents, type StoredCartLine } from "@/lib/stored-cart";
import {
  allocateCents,
  applyCheckoutShipping,
  canBuyLabel,
  insuranceDefaultOn,
  insuranceFeeCents,
  markupCents,
  parseShippingMarkup,
  priceRate,
  stripeShippingLines,
} from "@/lib/shipping";
import { createEasyPostProvider } from "@/lib/tracking-provider";

function line(overrides: Partial<Parameters<typeof applyCheckoutShipping>[0]["lines"][number]> = {}) {
  return {
    productId: "p1",
    sellerProfileId: "seller-1",
    sellerName: "Ada",
    quantity: 1,
    unitPriceCents: 8000,
    flatShippingCents: 800,
    fulfillment: "SHIP" as const,
    needsFreightQuote: false,
    ...overrides,
  };
}

describe("shipping markup and insurance", () => {
  it("parses a percent, a flat cent amount, and zero", () => {
    expect(parseShippingMarkup("10%")).toEqual({ kind: "percent", percent: 10 });
    expect(parseShippingMarkup("150")).toEqual({ kind: "flat", cents: 150 });
    expect(parseShippingMarkup("")).toEqual({ kind: "flat", cents: 0 });
    expect(markupCents(2000, { kind: "percent", percent: 10 })).toBe(200);
    expect(markupCents(2000, { kind: "flat", cents: 150 })).toBe(150);
  });

  it("turns insurance on at the threshold and prices it at cost", () => {
    expect(insuranceDefaultOn(49999, 50000)).toBe(false);
    expect(insuranceDefaultOn(50000, 50000)).toBe(true);
    expect(insuranceFeeCents(50000)).toBe(250);
    expect(insuranceFeeCents(1000)).toBe(50);
  });

  it("keeps the margin separate from the insurance the buyer pays", () => {
    const priced = priceRate({
      labelCostCents: 1200,
      merchandiseCents: 80000,
      insured: true,
      markup: { kind: "percent", percent: 10 },
    });
    expect(priced.marginCents).toBe(120);
    expect(priced.buyerShippingCents).toBe(1320);
    expect(priced.insuranceCents).toBe(400);
    expect(priced.buyerChargeCents).toBe(1720);
  });
});

describe("checkout shipping lines", () => {
  const quote = {
    sellerProfileId: "seller-1",
    easypostShipmentId: "shp_1",
    rates: [
      { id: "rate_ground", carrier: "USPS", service: "GroundAdvantage", labelCostCents: 800, deliveryDays: 5 },
      { id: "rate_express", carrier: "USPS", service: "Priority", labelCostCents: 1500, deliveryDays: 2 },
    ],
  };

  it("charges the buyer the marked-up rate they chose, as its own Stripe lines", () => {
    const result = applyCheckoutShipping({
      liveRatesEnabled: true,
      markup: { kind: "flat", cents: 100 },
      lines: [line(), line({ productId: "p2", unitPriceCents: 2000, flatShippingCents: 500 })],
      quotes: [quote],
      selections: [{ sellerProfileId: "seller-1", rateId: "rate_ground", insured: true }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shipments[0]?.labelCostCents).toBe(800);
    expect(result.shipments[0]?.marginCents).toBe(100);
    expect(result.shipments[0]?.buyerShippingCents).toBe(900);
    expect(result.shipments[0]?.insuranceCents).toBe(50);
    const allocated = Object.values(result.shippingByProduct).reduce((sum, cents) => sum + cents, 0);
    expect(allocated).toBe(result.shipments[0]?.buyerChargeCents);
    const stored: StoredCartLine[] = [
      {
        productId: "p1",
        quantity: 1,
        unitPriceCents: 8000,
        shippingCostCents: result.shippingByProduct.p1 ?? 0,
        sellerProfileId: "seller-1",
        title: "Bowl",
        fulfillmentMethod: "SHIP",
      },
      {
        productId: "p2",
        quantity: 1,
        unitPriceCents: 2000,
        shippingCostCents: result.shippingByProduct.p2 ?? 0,
        sellerProfileId: "seller-1",
        title: "Cup",
        fulfillmentMethod: "SHIP",
      },
    ];
    const stripe = stripeShippingLines(result.shipments);
    const stripeTotal = stored.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0) + stripe.reduce((sum, item) => sum + item.amountCents, 0);
    expect(stripe.map((item) => item.name)).toEqual([
      "Shipping — Ada (USPS GroundAdvantage)",
      "Shipping insurance — Ada",
    ]);
    expect(stripeTotal).toBe(orderTotalCents(stored));
  });

  it("falls back to the seller flat rate when live rates are off", () => {
    const result = applyCheckoutShipping({
      liveRatesEnabled: false,
      lines: [line()],
      quotes: [],
      selections: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shipments[0]?.mode).toBe("flat");
    expect(result.shippingByProduct.p1).toBe(800);
  });

  it("refuses a freight item", () => {
    const result = applyCheckoutShipping({
      liveRatesEnabled: false,
      lines: [line({ needsFreightQuote: true })],
      quotes: [],
      selections: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe("label purchase", () => {
  it("buys the saved rate once and refuses a flat-rate order", async () => {
    expect(canBuyLabel({ mode: "flat", easypostShipmentId: null, easypostRateId: null, labelUrl: null }).ok).toBe(false);
    expect(
      canBuyLabel({ mode: "calculated", easypostShipmentId: "shp_1", easypostRateId: "rate_1", labelUrl: null }),
    ).toEqual({ ok: true, alreadyPurchased: false });

    const calls: Array<{ url: string; body: string }> = [];
    const provider = createEasyPostProvider("test_key", (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? "") });
      return new Response(
        JSON.stringify({
          tracking_code: "9400111899223344556677",
          postage_label: { label_pdf_url: "https://example.com/label.pdf" },
          selected_rate: { rate: "8.00" },
          tracker: { public_url: "https://track.easypost.com/example" },
        }),
        { status: 200 },
      );
    }) as typeof fetch);
    const bought = await provider.buyLabel({ shipmentId: "shp_1", rateId: "rate_ground", insuranceDollars: "80.00" });
    expect(bought?.trackingNumber).toBe("9400111899223344556677");
    expect(bought?.labelUrl).toBe("https://example.com/label.pdf");
    expect(bought?.labelCostCents).toBe(800);
    expect(calls[0]?.url).toContain("/shipments/shp_1/buy");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({ rate: { id: "rate_ground" }, insurance: "80.00" });
  });

  it("splits a shipping charge across lines without losing a cent", () => {
    expect(allocateCents(100, [1, 1, 1])).toEqual([33, 33, 34]);
  });
});
