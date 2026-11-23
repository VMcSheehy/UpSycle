# UpSycle
up cycled goods marketplacee

## Seller billing

Approved shops are billed with Stripe subscriptions. Tier 1 is $39.99 a month, Tier 2 is $24.99 a month, and Tier 3 is $14.99 a month. Annual billing is ten times the monthly price. Prices live in `lib/tiers.ts`. Stripe Price ids are not stored in the repo. The app looks them up by `upsycle_tier1_monthly`, `upsycle_tier2_monthly`, `upsycle_tier3_monthly`, and the matching `_annual` keys.

A new seller gets a 7-day trial. The first 50 Founding Artist sellers get 90 days free, then 50% off for 9 months (`founding_artist_50off_9mo`), then the current price. They enter `FOUNDING50` on the billing page, or an admin marks the shop. There is no lifetime price lock. Changing plans in the billing portal moves the seller to the current price, with proration. The portal also updates the card and cancels at the end of the period.

The seller's tier and subscription status are written only when Stripe calls `/api/webhooks/stripe`. The success page does not change the tier.

Past-due, unpaid, and canceled shops stay visible for `BILLING_GRACE_DAYS` (default 7), then their listings are hidden and the dashboard shows a banner.

### Environment

Copy `.env.example` to `.env`.

- `STRIPE_SECRET_KEY` — test secret or, preferably, a restricted test key (`rk_test_...`). The setup script refuses `sk_live_` and `rk_live_`.
- `STRIPE_WEBHOOK_SECRET` — signing secret for `/api/webhooks/stripe`.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — test publishable key. Hosted Checkout does not need it in the browser.
- `SITE_URL` — origin used for Checkout and portal return URLs, for example `http://localhost:3000`.
- `BILLING_GRACE_DAYS` — optional, default 7.

In production, keep the secret key and webhook secret in AWS Secrets Manager (`upsycle/stripe/secret-key` and `upsycle/stripe/webhook-secret`). Do not put them in the repo.

A restricted key for the app needs Checkout Sessions, Customer Portal sessions, Customers, Subscriptions, Subscription Schedules, Prices (read), and Invoices (read). The setup script also needs Products, Prices (write), Coupons, Promotion Codes, and Portal configurations. Use a separate restricted key for that script.

### One-time Stripe test setup

Do not point this at a live key. The old live product "UpSycle Market Subscription Fees" is not reused.

```bash
STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
```

The script prints each product, price, coupon, promotion code, and portal configuration it created or left in place. It does not change subscriptions that already exist.

### Webhook

Register `https://<your-domain>/api/webhooks/stripe` in the Stripe Dashboard (test mode first). For local work:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Send these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.trial_will_end`
- `invoice.paid`
- `invoice.payment_failed`

Before going live, also subscribe to `charge.dispute.created`, `charge.refunded`, and `radar.early_fraud_warning.created` if you want a person to review disputes. This app does not cancel a shop from those events. If Stripe itself cancels the subscription, `customer.subscription.deleted` updates the shop.

### Tax

Stripe Tax is on for the account, and there are no tax registrations yet. Checkout does not turn on `automatic_tax`, because Stripe would collect no tax and would not report an error. Products use tax code `txcd_20030000` (General - Services), and prices are tax-exclusive, so tax can be turned on after a registration is collecting. Confirm that code with a tax advisor. The catalog is at https://docs.stripe.com/tax/tax-codes. Recurring tax setup is at https://docs.stripe.com/billing/taxes/collect-taxes.

Add-on prices are not billed in this release. Later add-ons should use lookup keys `upsycle_addon_<name>_t1`, `_t2`, and `_t3` so each tier can have its own price.

## Calculated shipping

The buyer pays shipping. Sellers do not. EasyPost is the default carrier account, behind the same provider used for tracking, so Shippo can be added later without rewriting checkout.

On each listing the seller picks a package preset (jewelry, photograph, framed art, glass, woodworking) or types length, width, height, and weight. They can change the numbers after picking a preset. A flat shipping rate stays on the listing for when live rates are off. "Oversized / needs freight quote" removes the item from checkout and shows a request form. That request is saved and emailed to the seller.

The seller saves a ship-from address once under shop settings. Buyers do not see the street.

At checkout, after the address is chosen, the app asks EasyPost for rates, one shipment per seller. The cheapest rate is selected. Ground and express are labeled. Shipping insurance is offered at EasyPost's published cost ($0.50 per $100, minimum $0.50) and is on by default when the seller's items in that shipment are at least `INSURANCE_THRESHOLD_CENTS` (default $500).

`SHIPPING_MARKUP` is `0`, a percent such as `10%`, or a flat amount in cents such as `150` for $1.50. It is added to the rate the buyer sees. Each shipment stores the label cost, the buyer charge, and the margin.

On the seller's sales page, **Buy & print label** purchases the rate the buyer chose and opens the PDF. The tracking number is saved and the buyer gets the shipped email.

A test EasyPost key (`EZTEST...` or the test key from the EasyPost dashboard) uses the same API. No key means calculated rates are hidden and checkout charges the listing's flat rate. The tracking webhook is unchanged: `https://<your-site>/api/webhooks/tracking` with `EASYPOST_WEBHOOK_SECRET`.

Set these in `.env` and on the running app. Do not commit them.

- `EASYPOST_API_KEY`
- `EASYPOST_WEBHOOK_SECRET`
- `SHIPPING_MARKUP` optional, default `0`
- `INSURANCE_THRESHOLD_CENTS` optional, default `50000`
- `SES_FROM_EMAIL` so quote requests and shipped mail can send
