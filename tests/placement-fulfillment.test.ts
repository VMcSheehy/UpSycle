import { describe, expect, it, vi } from "vitest";

import { fulfillPlacementSlot } from "@/lib/placement-fulfillment";

describe("fulfillPlacementSlot", () => {
  it("refunds a paid amount that does not match the slot price and does not record the slot", async () => {
    const assignSlot = vi.fn();
    const refund = vi.fn(async () => {});

    const result = await fulfillPlacementSlot({
      paymentStatus: "paid",
      amountTotal: 100,
      expectedPriceCents: 999,
      findExisting: async () => null,
      assignSlot,
      refund,
    });

    expect(result).toEqual({ outcome: "refunded", reason: "amount" });
    expect(assignSlot).not.toHaveBeenCalled();
    expect(refund).toHaveBeenCalledWith(100);
  });

  it("refunds when a paid slot cannot be recorded", async () => {
    const refund = vi.fn(async () => {});
    const result = await fulfillPlacementSlot({
      paymentStatus: "paid",
      amountTotal: 999,
      expectedPriceCents: 999,
      findExisting: async () => null,
      assignSlot: async () => null,
      refund,
    });

    expect(result).toEqual({ outcome: "refunded", reason: "unavailable" });
    expect(refund).toHaveBeenCalledWith(999);
  });

  it("refunds instead of retrying forever when recording throws", async () => {
    const refund = vi.fn(async () => {});
    const result = await fulfillPlacementSlot({
      paymentStatus: "paid",
      amountTotal: 999,
      expectedPriceCents: 999,
      findExisting: async () => null,
      assignSlot: async () => {
        throw new Error("database unavailable");
      },
      refund,
    });

    expect(result).toEqual({ outcome: "refunded", reason: "unavailable" });
    expect(refund).toHaveBeenCalledWith(999);
  });

  it("does not assign a slot again when the payment was already recorded", async () => {
    const assignSlot = vi.fn();
    const result = await fulfillPlacementSlot({
      paymentStatus: "paid",
      amountTotal: 999,
      expectedPriceCents: 999,
      findExisting: async () => ({ id: "slot-1" }),
      assignSlot,
      refund: async () => {},
    });

    expect(result).toEqual({ outcome: "duplicate", slotPurchaseId: "slot-1" });
    expect(assignSlot).not.toHaveBeenCalled();
  });
});
