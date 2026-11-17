import Stripe from "stripe";

// One Stripe client per process. The key is read when a route needs it, so
// the app still builds without a Stripe account. Pass a restricted key
// (rk_test_ / rk_live_) when you can. Do not log the key.
let client: Stripe | undefined;

export function getStripeClient(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured. Set it in .env once a Stripe account is provisioned.",
      );
    }
    client = new Stripe(key, {
      apiVersion: "2026-09-30.endive",
      typescript: true,
    });
  }
  return client;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not configured. Set it in .env once the Stripe webhook endpoint is registered.",
    );
  }
  return secret;
}
