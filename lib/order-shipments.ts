import { prisma } from "@/lib/prisma";
import type { CheckoutShipmentDraft } from "@/lib/shipping";

export function parseStoredShipments(value: unknown): CheckoutShipmentDraft[] {
  if (!Array.isArray(value)) return [];
  const shipments: CheckoutShipmentDraft[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Partial<CheckoutShipmentDraft>;
    if (typeof row.sellerProfileId !== "string") continue;
    if (row.mode !== "calculated" && row.mode !== "flat") continue;
    if (!Number.isInteger(row.labelCostCents) || !Number.isInteger(row.buyerChargeCents)) continue;
    shipments.push({
      sellerProfileId: row.sellerProfileId,
      sellerName: typeof row.sellerName === "string" ? row.sellerName : "Seller",
      mode: row.mode,
      carrier: row.carrier ?? null,
      service: row.service ?? null,
      speed: row.speed ?? null,
      easypostShipmentId: row.easypostShipmentId ?? null,
      easypostRateId: row.easypostRateId ?? null,
      labelCostCents: row.labelCostCents as number,
      buyerShippingCents: Number.isInteger(row.buyerShippingCents) ? (row.buyerShippingCents as number) : 0,
      insuranceCents: Number.isInteger(row.insuranceCents) ? (row.insuranceCents as number) : 0,
      buyerChargeCents: row.buyerChargeCents as number,
      marginCents: Number.isInteger(row.marginCents) ? (row.marginCents as number) : 0,
      insured: Boolean(row.insured),
    });
  }
  return shipments;
}

export async function attachOrderShipments(orderId: string, raw: unknown): Promise<void> {
  const shipments = parseStoredShipments(raw);
  if (shipments.length === 0) return;
  const existing = await prisma.shipment.count({ where: { orderId } });
  if (existing > 0) return;

  await prisma.$transaction(async (tx) => {
    for (const shipment of shipments) {
      const created = await tx.shipment.create({
        data: {
          orderId,
          sellerProfileId: shipment.sellerProfileId,
          mode: shipment.mode,
          carrier: shipment.carrier,
          service: shipment.service,
          speed: shipment.speed,
          easypostShipmentId: shipment.easypostShipmentId,
          easypostRateId: shipment.easypostRateId,
          labelCostCents: shipment.labelCostCents,
          buyerShippingCents: shipment.buyerShippingCents,
          insuranceCents: shipment.insuranceCents,
          buyerChargeCents: shipment.buyerChargeCents,
          marginCents: shipment.marginCents,
          insured: shipment.insured,
        },
      });
      await tx.orderItem.updateMany({
        where: { orderId, sellerProfileId: shipment.sellerProfileId, fulfillmentMethod: "SHIP" },
        data: { shipmentId: created.id },
      });
    }
  });
}
