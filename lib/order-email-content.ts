export type OrderEmailKind = "placed" | "shipped" | "delivered" | "cancelled";

export function orderEmailContent(input: {
  kind: OrderEmailKind;
  orderId: string;
  productTitle?: string;
  refundCents?: number;
}): { subject: string; text: string } {
  const shortId = input.orderId.slice(0, 8);
  const item = input.productTitle ? ` (${input.productTitle})` : "";
  const refund =
    input.refundCents && input.refundCents > 0
      ? ` A refund of $${(input.refundCents / 100).toFixed(2)} is on its way to the card used at checkout.`
      : "";

  switch (input.kind) {
    case "placed":
      return {
        subject: `UpSycle Market order ${shortId}`,
        text: `We received your UpSycle Market order ${input.orderId}.${refund} Each seller ships their own items. You can review the order in your account.`,
      };
    case "shipped":
      return {
        subject: `Your UpSycle Market order ${shortId} has shipped`,
        text: `An item in order ${input.orderId}${item} has shipped.`,
      };
    case "delivered":
      return {
        subject: `Your UpSycle Market order ${shortId} was delivered`,
        text: `An item in order ${input.orderId}${item} was marked delivered.`,
      };
    case "cancelled":
      return {
        subject: `An item in UpSycle Market order ${shortId} was cancelled`,
        text: `An item in order ${input.orderId}${item} was cancelled.${refund}`,
      };
  }
}
