import LegalPageLayout, { LegalSection, type LegalTocItem } from "@/components/legal/LegalPageLayout";

export const metadata = {
  title: "Shipping & Delivery Policy — UpSycle Market",
};

const toc: LegalTocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "options", label: "Shipping & Delivery Options" },
  { id: "international", label: "Do You Deliver Internationally?" },
  { id: "delays", label: "What Happens if My Order Is Delayed?" },
  { id: "contact", label: "Contact Us About This Policy" },
];

export default function ShippingPolicyPage() {
  return (
    <LegalPageLayout
      eyebrow="UpSycle Market"
      title="Shipping & Delivery Policy"
      effectiveDate="August 25, 2026"
      lastUpdated="August 25, 2026"
      disclaimer={
        <>
          Listings on UpSycle Market are created and fulfilled by independent sellers, so shipping
          methods, timelines, and rates vary by seller. Sellers set their own shipping rates, and
          the rate is shown on each listing and again at checkout.
        </>
      }
      toc={toc}
    >
      <LegalSection id="overview" num="01" title="Overview">
        <p>
          Please carefully review our Shipping &amp; Delivery Policy when purchasing our products.
          This policy applies to any order you place with us.
        </p>
      </LegalSection>

      <LegalSection id="options" num="02" title="Shipping & Delivery Options">
        <h3>In-Store Pickup</h3>
        <p>
          Curbside pickup is available for large UpSycle furniture. Pickup scheduling is
          coordinated directly with the seller.
        </p>
        <p>
          We offer various shipping options. In some cases a third-party supplier may be managing
          our inventory and will be responsible for shipping your products.
        </p>
        <h3>Shipping Fees</h3>
        <p>
          Sellers set their own shipping rates. The rate for a listing is shown on that listing and
          again at checkout.
        </p>
        <p>
          All times and dates given for delivery of the products are given in good faith but are
          estimates only. Buyer is responsible for shipping charges.
        </p>
      </LegalSection>

      <LegalSection id="international" num="03" title="Do You Deliver Internationally?">
        <p>We do not offer international shipping.</p>
      </LegalSection>

      <LegalSection id="delays" num="04" title="What Happens if My Order Is Delayed?">
        <p>
          If delivery is delayed for any reason we will let you know as soon as possible and will
          advise you of a revised estimated date for delivery.
        </p>
      </LegalSection>

      <LegalSection id="contact" num="05" title="Contact Us About This Policy">
        <p>If you have any further questions or comments, you may contact us by:</p>
        <p>
          Email: <a href="mailto:vmcsheehy@upsyclemarket.com">vmcsheehy@upsyclemarket.com</a>
          <br />
          Phone: (760) 695-2784
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
