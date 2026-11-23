export type PlacementFulfillmentResult =
  | { outcome: "ignored_unpaid" }
  | { outcome: "duplicate"; slotPurchaseId: string }
  | { outcome: "recorded"; slotPurchaseId: string }
  | { outcome: "refunded"; reason: "amount" | "unavailable" };

// Records a featured-slot purchase only when the session is paid and the
// amount matches the slot price. If the slot cannot be saved, the charge is
// refunded and the caller acknowledges the webhook so Stripe does not retry
// forever.
export async function fulfillPlacementSlot(input: {
  paymentStatus: string | null;
  amountTotal: number | null;
  expectedPriceCents: number;
  findExisting: () => Promise<{ id: string } | null>;
  assignSlot: () => Promise<{ id: string } | null>;
  refund: (amountCents: number) => Promise<void>;
}): Promise<PlacementFulfillmentResult> {
  const existing = await input.findExisting();
  if (existing) {
    return { outcome: "duplicate", slotPurchaseId: existing.id };
  }

  if (input.paymentStatus !== "paid") {
    return { outcome: "ignored_unpaid" };
  }

  if (input.amountTotal !== input.expectedPriceCents) {
    if (input.amountTotal && input.amountTotal > 0) {
      await input.refund(input.amountTotal);
    }
    return { outcome: "refunded", reason: "amount" };
  }

  let assigned: { id: string } | null;
  try {
    assigned = await input.assignSlot();
  } catch (err) {
    const again = await input.findExisting();
    if (again) {
      return { outcome: "duplicate", slotPurchaseId: again.id };
    }
    if (input.amountTotal && input.amountTotal > 0) {
      await input.refund(input.amountTotal);
    }
    console.error("Paid featured slot could not be recorded; refunded instead", err);
    return { outcome: "refunded", reason: "unavailable" };
  }

  if (!assigned) {
    if (input.amountTotal && input.amountTotal > 0) {
      await input.refund(input.amountTotal);
    }
    return { outcome: "refunded", reason: "unavailable" };
  }

  return { outcome: "recorded", slotPurchaseId: assigned.id };
}
