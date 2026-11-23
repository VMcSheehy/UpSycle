export type OrderEmailKind = "placed" | "shipped" | "delivered" | "cancelled" | "exception";

export function orderEmailContent(input: {
  kind: OrderEmailKind;
  orderId: string;
  productTitle?: string;
  refundCents?: number;
  trackingUrl?: string | null;
  detail?: string | null;
}): { subject: string; text: string } {
  const shortId = input.orderId.slice(0, 8);
  const item = input.productTitle ? ` (${input.productTitle})` : "";
  const refund =
    input.refundCents && input.refundCents > 0
      ? ` A refund of $${(input.refundCents / 100).toFixed(2)} is on its way to the card used at checkout.`
      : "";
  const track = input.trackingUrl ? ` Track it: ${input.trackingUrl}` : "";
  const detail = input.detail ? ` ${input.detail}` : "";

  switch (input.kind) {
    case "placed":
      return {
        subject: `UpSycle Market order ${shortId}`,
        text: `We received your UpSycle Market order ${input.orderId}.${refund} Each seller ships their own items. You can review the order in your account.`,
      };
    case "shipped":
      return {
        subject: "Your order shipped",
        text: `An item in order ${input.orderId}${item} has shipped.${track}`,
      };
    case "delivered":
      return {
        subject: `Your UpSycle Market order ${shortId} was delivered`,
        text: `An item in order ${input.orderId}${item} was delivered.${track}`,
      };
    case "exception":
      return {
        subject: `A shipment in order ${shortId} needs attention`,
        text: `An item in order ${input.orderId}${item} has a delivery problem.${detail}${track}`,
      };
    case "cancelled":
      return {
        subject: `An item in UpSycle Market order ${shortId} was cancelled`,
        text: `An item in order ${input.orderId}${item} was cancelled.${refund}`,
      };
  }
}
