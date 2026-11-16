import type { Metadata } from "next";
import ContactForm, { SUPPORT_EMAIL } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact — UpSycle Market",
  description: "Contact UpSycle Market at support@upsyclemarket.com.",
};

export default function ContactPage() {
  return (
    <section className="bg-[var(--black)] px-6 py-28 md:px-14">
      <div className="sec-max grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <div>
          <div className="eyebrow">Contact</div>
          <h1 className="sec-title">
            Write to <em>UpSycle Market</em>
          </h1>
          <p className="mb-6 text-[0.97rem] font-light leading-loose text-[var(--muted2)]">
            Questions about an order, a listing, or a seller application can come here.
          </p>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--rg-core)]">
            Email
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-2 inline-block font-serif text-[1.6rem] text-[var(--rg-light)] no-underline transition-colors hover:text-[var(--cream)]"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
        <ContactForm />
      </div>
    </section>
  );
}
