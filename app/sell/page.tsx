import type { Metadata } from "next";
import Link from "next/link";
import type { PlacementPageType } from "@prisma/client";
import { PAID_SLOT_PRICE_CENTS } from "@/lib/placement";
import {
  COMPARISON_ROWS,
  SELLER_PLANS,
  TRIAL_DAYS,
  formatTierPrice,
  sellerApplyHref,
  sellerFaqItems,
  startingPlan,
} from "@/lib/tiers";

const fromPrice = formatTierPrice(startingPlan().monthlyPriceCents);

export const metadata: Metadata = {
  title: "Sell on UpSycle — UpSycle Market",
  description: `Sell handmade and upcycled work on UpSycle, a curated marketplace for independent artists only. Plans from ${fromPrice}/mo, with a ${TRIAL_DAYS}-day free trial. Created By US, Treasured By You.`,
  alternates: { canonical: "/sell" },
  openGraph: {
    title: "Sell on UpSycle",
    description: `A curated marketplace for independent artists. Plans from ${fromPrice}/mo, with a ${TRIAL_DAYS}-day free trial.`,
    url: "/sell",
    type: "website",
  },
};

const steps = [
  {
    num: "01",
    title: "Apply",
    body: "Tell us about the work you make and choose the plan that fits your shop.",
  },
  {
    num: "02",
    title: "Get approved",
    body: "Every application is reviewed. UpSycle welcomes independent artists who make the work themselves.",
  },
  {
    num: "03",
    title: "List your work",
    body: "Open your shop and add the pieces you made by hand, with the story behind them.",
  },
  {
    num: "04",
    title: "Get paid",
    body: "Buyers check out on UpSycle. Your plan is a flat monthly price, with no per-sale commission.",
  },
];

const sharePlaces = [
  "Instagram",
  "Facebook",
  "Pinterest",
  "TikTok",
  "Your website",
  "Craft fairs",
];

const highlightSlots: { pageType: PlacementPageType; name: string; detail: string }[] = [
  {
    pageType: "HOME",
    name: "Home",
    detail: "A highlighted spot on the homepage for one week.",
  },
  {
    pageType: "SUBCATEGORY",
    name: "Subcategory",
    detail: "A highlighted spot on a subcategory page for one week.",
  },
  {
    pageType: "CATEGORY",
    name: "Category",
    detail: "A highlighted spot on a category page for one week.",
  },
];

const faq = sellerFaqItems();

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default function SellPage() {
  return (
    <div className="bg-[#000000] text-[#FFEBE4]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <section className="px-6 pt-32 pb-8 text-center md:px-14 md:pt-40 md:pb-10">
        <div className="sec-max">
          <div className="eyebrow mx-auto w-fit justify-center">For makers</div>
          <h1 className="font-serif text-[clamp(2.4rem,4vw,3.6rem)] font-normal leading-[1.1] text-[#FFEBE4]">
            Sell on <span className="grad-text">UpSycle</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[0.95rem] leading-relaxed text-[rgba(255,235,228,0.72)]">
            A curated marketplace for independent artists only. Created By US, Treasured By You.
            Your shop goes wherever you do. Choose the plan that fits your shop. Every plan includes
            a {TRIAL_DAYS}-day free trial.
          </p>
        </div>
      </section>

      <section id="selling-steps" className="px-6 pb-16 md:px-14">
        <div className="sec-max">
          <div className="eyebrow">How it works</div>
          <h2 className="sec-title">From your application to a sale</h2>
          <ol className="grid list-none grid-cols-1 gap-px bg-[rgba(199,138,110,0.4)] sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <li key={step.num} className="bg-[#000000] p-7 md:p-8">
                <div className="grad-text mb-4 font-serif text-5xl font-light opacity-45">{step.num}</div>
                <h3 className="mb-2 font-serif text-2xl font-normal leading-tight text-[#FFEBE4]">
                  {step.title}
                </h3>
                <p className="text-[0.88rem] font-light leading-relaxed text-[rgba(255,235,228,0.72)]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="sell-everywhere" className="px-6 pb-16 md:px-14">
        <div className="sec-max border border-[rgba(199,138,110,0.4)] bg-[#000000] px-6 py-10 md:px-12 md:py-12">
          <div className="eyebrow">Your shop</div>
          <h2 className="sec-title">Sell everywhere</h2>
          <p className="max-w-2xl text-[0.97rem] leading-relaxed text-[rgba(255,235,228,0.72)]">
            Your UpSycle shop goes wherever you do. The page is easy to read on a phone and on a
            computer. Every shop and every piece has its own link. The share button on the page
            opens the share sheet when your browser has one, and copies the link when it does not.
          </p>
          <ul className="mt-6 flex list-none flex-wrap gap-2">
            {sharePlaces.map((place) => (
              <li
                key={place}
                className="border border-[#C78A6E] bg-[#000000] px-3 py-1.5 text-[0.62rem] font-semibold tracking-[0.14em] text-[#FFEBE4] uppercase"
              >
                {place}
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-2xl text-[0.95rem] leading-relaxed text-[#FFEBE4]">
            Take the link to Instagram, Facebook, Pinterest, TikTok, your own website, or a card at
            a craft fair. A buyer opens it and shops. UpSycle ships within the United States, and
            the shipping rate is on the listing.
          </p>
        </div>
      </section>

      <section id="plans" className="px-6 pb-16 md:px-14">
        <div className="sec-max">
          <div className="grid grid-cols-1 items-stretch gap-8 pt-3 lg:grid-cols-3 lg:gap-[22px]">
            {SELLER_PLANS.map((plan) => (
              <article
                key={plan.id}
                className={`relative flex flex-col px-6 pt-7 pb-6 ${
                  plan.popular
                    ? "border-2 border-[#C78A6E] bg-[linear-gradient(180deg,rgba(199,138,110,0.14)_0%,rgba(0,0,0,0)_42%)]"
                    : "border border-[rgba(199,138,110,0.4)] bg-[#000000]"
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-[-12px] left-1/2 -translate-x-1/2 bg-[linear-gradient(145deg,#C78A6E_0%,#D9A188_32%,#ECB7A9_58%,#D9A188_82%,#C78A6E_100%)] px-3 py-[5px] text-[0.55rem] font-bold tracking-[0.14em] whitespace-nowrap text-[#000000] uppercase">
                    Most popular
                  </div>
                )}
                <div>
                  <span className="inline-flex bg-[linear-gradient(145deg,#C78A6E_0%,#D9A188_32%,#ECB7A9_58%,#D9A188_82%,#C78A6E_100%)] px-2.5 py-1 text-[0.55rem] font-bold tracking-[0.14em] text-[#000000] uppercase">
                    {plan.name}
                  </span>
                </div>
                <h3 className="mt-3 font-serif text-[2rem] font-normal leading-none text-[#FFEBE4]">
                  {plan.tierLabel}
                </h3>
                <p className="mt-2 mb-4 min-h-0 text-[0.72rem] leading-snug text-[rgba(255,235,228,0.72)] lg:min-h-[3.1em]">
                  {plan.audience}
                </p>
                <div className="font-serif text-[2.6rem] leading-none font-normal text-[#FFEBE4]">
                  {formatTierPrice(plan.monthlyPriceCents)}
                  <span className="ml-1 font-sans text-[0.95rem] text-[rgba(255,235,228,0.72)]">/mo</span>
                </div>
                <ul className="mt-5 mb-6 flex flex-1 list-none flex-col gap-[9px]">
                  {plan.highlights.map((item) => (
                    <li
                      key={item}
                      className="relative pl-[18px] text-[0.8rem] leading-snug text-[#FFEBE4] before:absolute before:top-[0.45em] before:left-0 before:h-[7px] before:w-[7px] before:bg-[#C78A6E]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href={sellerApplyHref(plan.id)}
                  className={`${plan.popular ? "btn-primary" : "btn-secondary"} w-full text-center`}
                >
                  Apply with this plan
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="compare" className="px-6 pb-16 md:px-14">
        <div className="sec-max">
          <div className="eyebrow">Compare</div>
          <h2 className="sec-title">What&rsquo;s included</h2>
          <p className="mb-4 text-[0.8rem] text-[rgba(255,235,228,0.72)] sm:hidden">
            Swipe sideways to compare plans.
          </p>
          <div className="overflow-x-auto border border-[rgba(199,138,110,0.4)]">
            <table className="w-full min-w-[720px] border-collapse text-left text-[0.82rem]">
              <caption className="sr-only">Seller plan comparison</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 bg-[rgba(255,235,228,0.05)] px-4 py-3 text-[0.62rem] font-semibold tracking-[0.14em] text-[#C78A6E] uppercase"
                  >
                    Feature
                  </th>
                  {SELLER_PLANS.map((plan) => (
                    <th
                      key={plan.id}
                      scope="col"
                      className={`px-4 py-3 text-[0.62rem] font-semibold tracking-[0.14em] text-[#C78A6E] uppercase ${
                        plan.popular ? "bg-[rgba(199,138,110,0.1)]" : "bg-[rgba(255,235,228,0.05)]"
                      }`}
                    >
                      {plan.tierLabel} · {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[rgba(199,138,110,0.4)]">
                  <th
                    scope="row"
                    className="sticky left-0 bg-[#000000] px-4 py-3 font-normal text-[rgba(255,235,228,0.72)]"
                  >
                    Monthly price
                  </th>
                  {SELLER_PLANS.map((plan) => (
                    <td
                      key={plan.id}
                      className={`px-4 py-3 text-[#FFEBE4] ${plan.popular ? "bg-[rgba(199,138,110,0.1)]" : ""}`}
                    >
                      {formatTierPrice(plan.monthlyPriceCents)}
                    </td>
                  ))}
                </tr>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.key} className="border-t border-[rgba(199,138,110,0.4)]">
                    <th
                      scope="row"
                      className="sticky left-0 bg-[#000000] px-4 py-3 font-normal text-[rgba(255,235,228,0.72)]"
                    >
                      {row.label}
                    </th>
                    {SELLER_PLANS.map((plan) => (
                      <td
                        key={plan.id}
                        className={`px-4 py-3 text-[#FFEBE4] ${plan.popular ? "bg-[rgba(199,138,110,0.1)]" : ""}`}
                      >
                        {plan.comparison[row.key]}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-[rgba(199,138,110,0.4)]">
                  <th
                    scope="row"
                    className="sticky left-0 bg-[#000000] px-4 py-3 font-normal text-[rgba(255,235,228,0.72)]"
                  >
                    Free trial
                  </th>
                  {SELLER_PLANS.map((plan) => (
                    <td
                      key={plan.id}
                      className={`px-4 py-3 text-[#FFEBE4] ${plan.popular ? "bg-[rgba(199,138,110,0.1)]" : ""}`}
                    >
                      {TRIAL_DAYS} days
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="highlights" className="px-6 pb-16 md:px-14">
        <div className="sec-max">
          <div className="eyebrow">Optional add-on</div>
          <h2 className="sec-title">Highlighted Artist slots</h2>
          <p className="mb-8 max-w-2xl text-[0.95rem] leading-relaxed text-[rgba(255,235,228,0.72)]">
            Any plan can buy a weekly Highlighted Artist slot. These prices are per week and sit on
            top of the monthly plan.
          </p>
          <div className="grid grid-cols-1 gap-px bg-[rgba(199,138,110,0.4)] sm:grid-cols-3">
            {highlightSlots.map((slot) => (
              <div key={slot.pageType} className="bg-[#000000] p-6 md:p-7">
                <div className="mb-2 text-[0.62rem] font-semibold tracking-[0.18em] text-[#C78A6E] uppercase">
                  {slot.name}
                </div>
                <div className="font-serif text-[2rem] leading-none text-[#FFEBE4]">
                  {formatTierPrice(PAID_SLOT_PRICE_CENTS[slot.pageType])}
                  <span className="ml-1 font-sans text-[0.9rem] text-[rgba(255,235,228,0.72)]">/week</span>
                </div>
                <p className="mt-3 text-[0.82rem] leading-relaxed text-[rgba(255,235,228,0.72)]">
                  {slot.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="trial" className="px-6 pb-16 md:px-14">
        <div className="sec-max flex flex-col items-start justify-between gap-6 bg-[#FFEBE4] px-6 py-9 text-[#000000] sm:flex-row sm:items-center md:px-9">
          <div>
            <h2 className="font-serif text-[clamp(1.6rem,2.4vw,2rem)] font-normal leading-tight">
              Try any plan free for {TRIAL_DAYS} days.
            </h2>
            <p className="mt-1.5 max-w-xl text-[0.9rem] leading-relaxed">
              You won&rsquo;t be charged unless you keep your shop open after the trial. Cancel anytime.
            </p>
          </div>
          <Link
            href={sellerApplyHref()}
            className="inline-flex shrink-0 items-center justify-center bg-[#000000] px-[30px] py-3.5 text-[0.68rem] font-semibold tracking-[0.18em] uppercase no-underline"
            style={{ color: "#FFEBE4" }}
          >
            Apply to sell
          </Link>
        </div>
      </section>

      <section id="seller-faq" className="px-6 pb-20 md:px-14">
        <div className="sec-max">
          <div className="eyebrow">Questions</div>
          <h2 className="sec-title">Seller FAQ</h2>
          <div className="border-t border-[rgba(199,138,110,0.4)]">
            {faq.map((item) => (
              <details key={item.question} open className="group border-b border-[rgba(199,138,110,0.4)] py-[18px]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-[1.25rem] text-[#FFEBE4] [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span
                    aria-hidden="true"
                    className="font-sans text-[#C78A6E] group-open:hidden"
                  >
                    +
                  </span>
                  <span aria-hidden="true" className="hidden font-sans text-[#C78A6E] group-open:inline">
                    –
                  </span>
                </summary>
                <p className="mt-2 max-w-[70ch] text-[0.9rem] leading-relaxed text-[rgba(255,235,228,0.72)]">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href={sellerApplyHref()} className="btn-primary">
              Apply to sell
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
