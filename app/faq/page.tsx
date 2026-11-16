import type { Metadata } from "next";
import Link from "next/link";
import { SELLER_TIER_OPTIONS, SELLER_TIER_VISIBILITY_COPY } from "@/lib/seller-tiers";

export const metadata: Metadata = {
  title: "FAQ — UpSycle Market",
  description:
    "Answers about buying, shipping, returns, seller applications, seller tiers, and payments on UpSycle Market.",
};

const sectionClass = "border border-[var(--border)] bg-[var(--charcoal)] p-6 md:p-8";
const questionClass = "mb-2 font-serif text-[1.25rem] font-normal leading-snug text-[var(--cream)]";
const answerClass = "text-[0.92rem] font-light leading-relaxed text-[var(--muted2)]";

export default function FaqPage() {
  return (
    <section className="bg-[var(--black)] px-6 py-28 md:px-14">
      <div className="sec-max">
        <div className="eyebrow">Help</div>
        <h1 className="sec-title">
          Frequently asked <em>questions</em>
        </h1>
        <p className="mb-12 max-w-2xl text-[0.97rem] font-light leading-loose text-[var(--muted2)]">
          Short answers drawn from how UpSycle Market already describes buying, shipping, returns,
          selling, and payment. The full policies are linked at the bottom of each section.
        </p>

        <div className="flex flex-col gap-8">
          <section id="buying" className={sectionClass}>
            <div className="mb-6 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[var(--rg-core)]">
              Buying
            </div>
            <div className="flex flex-col gap-7">
              <div>
                <h2 className={questionClass}>What can I buy here?</h2>
                <p className={answerClass}>
                  Handmade and upcycled goods from independent artists. Every piece is one of a
                  kind. UpSycle Market does not allow factory goods or resellers. Every listing
                  must be handmade or upcycled by the seller personally.
                </p>
              </div>
              <div>
                <h2 className={questionClass}>How do I buy something?</h2>
                <p className={answerClass}>
                  Browse the market, open a listing, and add it to your cart. Checkout asks you to
                  sign in. The terms say prices are in US dollars, and sales tax is added when it
                  is required. Payments are processed by Stripe. The terms list Visa, Mastercard,
                  American Express, and Discover.
                </p>
              </div>
              <div>
                <h2 className={questionClass}>Is there a buyer fee?</h2>
                <p className={answerClass}>
                  The homepage says buyers pay a 6% service fee at checkout.
                </p>
              </div>
            </div>
          </section>

          <section id="shipping-returns" className={sectionClass}>
            <div className="mb-6 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[var(--rg-core)]">
              Shipping and returns
            </div>
            <div className="flex flex-col gap-7">
              <div>
                <h2 className={questionClass}>Who sets the shipping rate?</h2>
                <p className={answerClass}>
                  Sellers set their own shipping rates. The rate is shown on each listing and again
                  at checkout. The buyer is responsible for shipping charges. Any delivery date is
                  an estimate. If a delivery is delayed, the shipping policy says we will tell you
                  and give a revised date.
                </p>
              </div>
              <div>
                <h2 className={questionClass}>Do you ship outside the United States?</h2>
                <p className={answerClass}>No. The shipping policy says we do not offer international shipping.</p>
              </div>
              <div>
                <h2 className={questionClass}>Can I pick an item up?</h2>
                <p className={answerClass}>
                  When a seller offers local pickup, the listing says so, and checkout lets you
                  choose local pickup instead of shipping. The shipping policy also says curbside
                  pickup is available for large furniture, with the time arranged directly with the
                  seller.
                </p>
              </div>
              <div>
                <h2 className={questionClass}>How do returns work?</h2>
                <p className={answerClass}>
                  The return policy says returns must be postmarked within seven days of the
                  purchase date, and items must be unused with the original tags and labels
                  attached. Email{" "}
                  <a className="text-[var(--rg-light)] underline" href="mailto:vmcsheehy@upsyclemarket.com">
                    vmcsheehy@upsyclemarket.com
                  </a>{" "}
                  for a return authorization number, then mail the package to UpSycle Market LLC,
                  Attn: Returns, 3020 Alta Vista Dr, Fallbrook, CA 92028, and include that number.
                  The policy says return shipping is paid or reimbursed by us. After the return is
                  received, allow at least seven days to process it. A refund can then take one to
                  two billing cycles to appear. For a defective or damaged item, contact us to
                  arrange a refund or exchange. A seller may also post their own return terms on a
                  listing. Where they do, those terms apply to that item alongside this policy.
                </p>
              </div>
            </div>
            <p className="mt-7 text-[0.8rem] text-[var(--muted)]">
              <Link href="/shipping" className="text-[var(--rg-light)] underline">
                Shipping &amp; Delivery
              </Link>
              {" · "}
              <Link href="/returns" className="text-[var(--rg-light)] underline">
                Return Policy
              </Link>
            </p>
          </section>

          <section id="selling" className={sectionClass}>
            <div className="mb-6 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[var(--rg-core)]">
              Seller application and approval
            </div>
            <div className="flex flex-col gap-7">
              <div>
                <h2 className={questionClass}>How do I apply to sell?</h2>
                <p className={answerClass}>
                  Use Open a Shop. UpSycle Market hand-reviews every application. You will be asked
                  for a local address, an optional story about your work, a website, social links,
                  your expected monthly sales, a seller tier, an optional referral, and five photos
                  of pieces you have made. A new applicant also creates an email and password. If
                  you already have an account, you apply with that login instead.
                </p>
              </div>
              <div>
                <h2 className={questionClass}>When is a shop approved?</h2>
                <p className={answerClass}>
                  The terms say sellers are approved based on authenticity and quality. Your
                  account stays pending until an admin reviews it. The confirmation page says most
                  applications are reviewed within a few business days, and that we email you when
                  the review is done. Resale, commercial, and large-production goods are not
                  allowed. The terms say UpSycle Market can remove a seller who lists those goods
                  and revoke their subscription.
                </p>
              </div>
            </div>
            <p className="mt-7 text-[0.8rem] text-[var(--muted)]">
              <Link href="/sell" className="text-[var(--rg-light)] underline">
                Apply to sell
              </Link>
            </p>
          </section>

          <section id="tiers" className={sectionClass}>
            <div className="mb-6 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[var(--rg-core)]">
              Seller tiers and pricing
            </div>
            <div className="flex flex-col gap-7">
              <div>
                <h2 className={questionClass}>What does a seller pay?</h2>
                <p className={answerClass}>
                  There are three monthly tiers and no per-sale commission. {SELLER_TIER_OPTIONS[0].label}{" "}
                  is {SELLER_TIER_OPTIONS[0].monthlyPrice} per month, {SELLER_TIER_OPTIONS[1].label} is{" "}
                  {SELLER_TIER_OPTIONS[1].monthlyPrice} per month, and {SELLER_TIER_OPTIONS[2].label} is{" "}
                  {SELLER_TIER_OPTIONS[2].monthlyPrice} per month. {SELLER_TIER_VISIBILITY_COPY}
                </p>
              </div>
              <div>
                <h2 className={questionClass}>How does the subscription work?</h2>
                <p className={answerClass}>
                  The terms say a subscription renews each month until you cancel it. You can
                  cancel from your account, and the cancellation takes effect at the end of the
                  current paid term. Questions about a subscription can be emailed to{" "}
                  <a className="text-[var(--rg-light)] underline" href="mailto:vmcsheehy@upsyclemarket.com">
                    vmcsheehy@upsyclemarket.com
                  </a>
                  . The terms also say subscription fees can change, and that any change will be
                  communicated as the law requires.
                </p>
              </div>
            </div>
          </section>

          <section id="payments" className={sectionClass}>
            <div className="mb-6 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[var(--rg-core)]">
              Payments
            </div>
            <div className="flex flex-col gap-7">
              <div>
                <h2 className={questionClass}>How is a purchase paid?</h2>
                <p className={answerClass}>
                  Checkout is processed by Stripe. The homepage calls this secure processing. The
                  terms say you authorize a charge to your chosen card for the purchase and any
                  applicable shipping, in US dollars. If a cart includes more than one seller, the
                  checkout page says it is still a single charge to UpSycle Market, and each seller
                  ships their own items.
                </p>
              </div>
            </div>
            <p className="mt-7 text-[0.8rem] text-[var(--muted)]">
              <Link href="/terms" className="text-[var(--rg-light)] underline">
                Terms &amp; Conditions
              </Link>
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
