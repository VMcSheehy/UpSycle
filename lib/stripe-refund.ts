import type Stripe from "stripe";

export async function refundStripePayment(
  stripe: Stripe,
  paymentIntentId: string,
  amountCents: number,
): Promise<void> {
  if (amountCents <= 0) return;
  await stripe.refunds.create(
    { payment_intent: paymentIntentId, amount: amountCents },
    { idempotencyKey: `upsycle-${paymentIntentId}-${amountCents}` },
  );
}

export function paymentIntentIdFromSession(paymentIntent: string | { id: string } | null): string | null {
  if (!paymentIntent) return null;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}
