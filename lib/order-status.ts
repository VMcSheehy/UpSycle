export type LineStatus = "PENDING_SHIPMENT" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export function lineChargeCents(item: {
  quantity: number;
  unitPriceCents: number;
  shippingCostCents: number;
}): number {
  return item.unitPriceCents * item.quantity + item.shippingCostCents;
}

export function canTransition(from: LineStatus, to: LineStatus): boolean {
  if (from === "PENDING_SHIPMENT" && (to === "SHIPPED" || to === "CANCELLED")) return true;
  if (from === "SHIPPED" && to === "DELIVERED") return true;
  return false;
}

// Whole-order status from the lines. Cancelled lines drop out. The order
// stays pending while any remaining line has not shipped, and delivered
// only when every remaining line is delivered.
export function aggregateOrderStatus(lines: LineStatus[]): LineStatus {
  const active = lines.filter((status) => status !== "CANCELLED");
  if (active.length === 0) return "CANCELLED";
  if (active.every((status) => status === "DELIVERED")) return "DELIVERED";
  if (active.some((status) => status === "PENDING_SHIPMENT")) return "PENDING_SHIPMENT";
  return "SHIPPED";
}

export type OrderItemPlan =
  | { kind: "reject"; status: 400 | 409; error: string }
  | { kind: "finish-refund"; amountCents: number }
  | { kind: "transition"; to: LineStatus; refundCents: number; restoreStock: boolean };

const REQUESTABLE: LineStatus[] = ["SHIPPED", "DELIVERED", "CANCELLED"];

export function planOrderItemChange(input: {
  current: LineStatus;
  requested: string;
  refundedAmountCents: number;
  chargeCents: number;
  hasPayment: boolean;
}): OrderItemPlan {
  if (!REQUESTABLE.includes(input.requested as LineStatus)) {
    return { kind: "reject", status: 400, error: "Choose shipped, delivered, or cancelled." };
  }
  const requested = input.requested as LineStatus;

  if (input.current === "CANCELLED" && requested === "CANCELLED") {
    const stillDue = Math.max(0, input.chargeCents - input.refundedAmountCents);
    if (stillDue === 0 || !input.hasPayment) {
      return { kind: "reject", status: 409, error: "This item is already cancelled." };
    }
    return { kind: "finish-refund", amountCents: stillDue };
  }

  if (!canTransition(input.current, requested)) {
    return {
      kind: "reject",
      status: 409,
      error: "That status change is not available for this item.",
    };
  }

  if (requested === "CANCELLED") {
    if (input.chargeCents > 0 && !input.hasPayment) {
      return {
        kind: "reject",
        status: 409,
        error: "This order has no card payment to refund, so it cannot be cancelled here.",
      };
    }
    return {
      kind: "transition",
      to: "CANCELLED",
      refundCents: input.chargeCents,
      restoreStock: true,
    };
  }

  return { kind: "transition", to: requested, refundCents: 0, restoreStock: false };
}
