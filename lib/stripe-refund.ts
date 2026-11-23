import type Stripe from "stripe";

export async function refundStripePayment(
  stripe: Stripe,
  paymentIntentId: string,
  amountCents: number,
  idempotencyKey?: string,
): Promise<string | undefined> {
  if (amountCents <= 0) return undefined;
  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId, amount: amountCents },
    { idempotencyKey: idempotencyKey ?? `upsycle-${paymentIntentId}-${amountCents}` },
  );
  return refund.id;
}

export function paymentIntentIdFromSession(paymentIntent: string | { id: string } | null): string | null {
  if (!paymentIntent) return null;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}
