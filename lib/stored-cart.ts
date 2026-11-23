export interface StoredCartLine {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  shippingCostCents: number;
  sellerProfileId: string;
  title: string;
  fulfillmentMethod: "SHIP" | "PICKUP";
}

export function lineChargeCents(line: StoredCartLine): number {
  return line.unitPriceCents * line.quantity + line.shippingCostCents;
}

export function orderTotalCents(lines: StoredCartLine[]): number {
  return lines.reduce((sum, line) => sum + lineChargeCents(line), 0);
}

export function paymentIsPaidAndMatches(paymentStatus: string | null, amountTotal: number | null, expectedCents: number): boolean {
  return paymentStatus === "paid" && amountTotal === expectedCents;
}

function isFulfillment(value: unknown): value is "SHIP" | "PICKUP" {
  return value === "SHIP" || value === "PICKUP";
}

export function parseStoredCartLines(value: unknown): StoredCartLine[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const lines: StoredCartLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const line = entry as Partial<StoredCartLine>;
    if (typeof line.productId !== "string" || !line.productId) return null;
    if (typeof line.sellerProfileId !== "string" || !line.sellerProfileId) return null;
    if (typeof line.title !== "string") return null;
    if (!isFulfillment(line.fulfillmentMethod)) return null;
    if (!Number.isInteger(line.quantity) || (line.quantity ?? 0) <= 0) return null;
    if (!Number.isInteger(line.unitPriceCents) || (line.unitPriceCents ?? 0) < 0) return null;
    if (!Number.isInteger(line.shippingCostCents) || (line.shippingCostCents ?? 0) < 0) return null;
    lines.push({
      productId: line.productId,
      quantity: line.quantity as number,
      unitPriceCents: line.unitPriceCents as number,
      shippingCostCents: line.shippingCostCents as number,
      sellerProfileId: line.sellerProfileId,
      title: line.title,
      fulfillmentMethod: line.fulfillmentMethod,
    });
  }
  return lines;
}
