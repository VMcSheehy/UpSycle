import { describe, expect, it } from "vitest";

import { publicAuthError } from "@/lib/auth-errors";
import { orderEmailContent, sendOrderEmail } from "@/lib/order-email";
import { aggregateOrderStatus, planOrderItemChange } from "@/lib/order-status";
import { consumeRateLimit, resetRateLimits } from "@/lib/rate-limit";
import { securityHeaders } from "@/lib/security-headers";
import { checkoutEventShouldFulfill } from "@/lib/stripe-events";
import { shouldReusePendingPeriod } from "@/lib/placement-jobs";

describe("checkout events", () => {
  it("fulfills a paid session and a delayed payment that later clears", () => {
    expect(checkoutEventShouldFulfill("checkout.session.completed")).toBe(true);
    expect(checkoutEventShouldFulfill("checkout.session.async_payment_succeeded")).toBe(true);
    expect(checkoutEventShouldFulfill("checkout.session.expired")).toBe(false);
  });
});

describe("order status", () => {
  it("cancels a pending line and names the refund", () => {
    expect(
      planOrderItemChange({
        current: "PENDING_SHIPMENT",
        requested: "CANCELLED",
        refundedAmountCents: 0,
        chargeCents: 2500,
        hasPayment: true,
      }),
    ).toEqual({ kind: "transition", to: "CANCELLED", refundCents: 2500, restoreStock: true });
  });

  it("refuses to cancel a paid line that has no Stripe payment", () => {
    const plan = planOrderItemChange({
      current: "PENDING_SHIPMENT",
      requested: "CANCELLED",
      refundedAmountCents: 0,
      chargeCents: 2500,
      hasPayment: false,
    });
    expect(plan.kind).toBe("reject");
  });

  it("ships, then delivers, and rolls the order up from its lines", () => {
    expect(
      planOrderItemChange({
        current: "PENDING_SHIPMENT",
        requested: "SHIPPED",
        refundedAmountCents: 0,
        chargeCents: 1000,
        hasPayment: true,
      }).kind,
    ).toBe("transition");
    expect(
      planOrderItemChange({
        current: "SHIPPED",
        requested: "DELIVERED",
        refundedAmountCents: 0,
        chargeCents: 1000,
        hasPayment: true,
      }),
    ).toMatchObject({ kind: "transition", to: "DELIVERED", refundCents: 0 });
    expect(aggregateOrderStatus(["DELIVERED", "CANCELLED"])).toBe("DELIVERED");
    expect(aggregateOrderStatus(["SHIPPED", "PENDING_SHIPMENT"])).toBe("PENDING_SHIPMENT");
    expect(aggregateOrderStatus(["CANCELLED", "CANCELLED"])).toBe("CANCELLED");
  });

  it("retries a refund that was recorded as cancelled but not refunded", () => {
    expect(
      planOrderItemChange({
        current: "CANCELLED",
        requested: "CANCELLED",
        refundedAmountCents: 0,
        chargeCents: 1800,
        hasPayment: true,
      }),
    ).toEqual({ kind: "finish-refund", amountCents: 1800 });
  });
});

describe("lottery draw", () => {
  it("reuses a pending period instead of drawing a second one", () => {
    expect(shouldReusePendingPeriod({ id: "period-1" })).toBe(true);
    expect(shouldReusePendingPeriod(null)).toBe(false);
  });
});

describe("auth errors and rate limits", () => {
  it("does not tell a caller whether the email exists", () => {
    const missing = Object.assign(new Error("User does not exist."), { name: "UserNotFoundException" });
    const wrong = Object.assign(new Error("Incorrect username or password."), { name: "NotAuthorizedException" });
    expect(publicAuthError(missing, "login")).toBe(publicAuthError(wrong, "login"));
    expect(publicAuthError(missing, "login")).not.toMatch(/exist|UserNotFound|does not/i);
    expect(publicAuthError(new Error("User pool us-west-2_abc does not exist"), "signup")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("stops a burst of attempts from one key", () => {
    resetRateLimits();
    const now = 1_000;
    expect(consumeRateLimit("login:1", 2, 1_000, now)).toBe(true);
    expect(consumeRateLimit("login:1", 2, 1_000, now + 1)).toBe(true);
    expect(consumeRateLimit("login:1", 2, 1_000, now + 2)).toBe(false);
    expect(consumeRateLimit("login:1", 2, 1_000, now + 1_000)).toBe(true);
  });
});

describe("security headers", () => {
  it("sets a content security policy that allows Stripe and blocks framing", () => {
    const headers = Object.fromEntries(securityHeaders().map((header) => [header.key, header.value]));
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("https://*.stripe.com");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});

describe("order email", () => {
  it("describes a refund in the cancellation note and skips sending when SES is unset", async () => {
    const content = orderEmailContent({
      kind: "cancelled",
      orderId: "order-12345678",
      productTitle: "Bowl",
      refundCents: 1250,
    });
    expect(content.subject).toContain("was cancelled");
    expect(content.text).toContain("order-12345678");
    expect(content.text).toContain("Bowl");
    expect(content.text).toContain("$12.50");

    const previous = process.env.SES_FROM_EMAIL;
    delete process.env.SES_FROM_EMAIL;
    await expect(
      sendOrderEmail({ to: "buyer@example.com", kind: "placed", orderId: "order-1" }),
    ).resolves.toBe("skipped");
    if (previous === undefined) delete process.env.SES_FROM_EMAIL;
    else process.env.SES_FROM_EMAIL = previous;
  });
});
