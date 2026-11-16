import Image from "next/image";
import Link from "next/link";

const footerCols = [
  {
    title: "Shop",
    links: [
      { href: "/browse", label: "Browse All" },
      { href: "/browse?cat=jewelry", label: "Jewelry" },
      { href: "/browse?cat=home-goods", label: "Home Goods" },
      { href: "/browse?cat=furniture", label: "Furniture" },
    ],
  },
  {
    title: "Sell",
    links: [
      { href: "/sell", label: "Open a Shop" },
      { href: "/login", label: "Seller Sign In" },
      { href: "/#how-it-works", label: "How It Works" },
    ],
  },
  {
    title: "Company",
    links: [{ href: "/#story", label: "Our Story" }],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/shipping", label: "Shipping & Delivery" },
      { href: "/returns", label: "Return Policy" },
      { href: "/acceptable-use", label: "Acceptable Use" },
      { href: "/disclaimer", label: "Disclaimer" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-[var(--black)] border-t border-[var(--border)] px-6 pt-12 pb-8 md:px-14">
      <div className="flex flex-wrap items-start justify-between gap-8 mb-9">
        <div>
          <Image
            src="/brand/lockup.webp"
            alt="UpSycle Market"
            width={480}
            height={430}
            quality={90}
            sizes="140px"
            className="h-auto w-[140px]"
          />
          <p className="mt-3 text-[0.72rem] tracking-[0.06em] text-[var(--rg-core)]">
            Created By US, Treasured By You
          </p>
        </div>
        <div className="flex flex-wrap gap-12">
          {footerCols.map((col) => (
            <div key={col.title}>
              <h4 className="text-[0.58rem] font-semibold tracking-[0.2em] uppercase text-[var(--rg-core)] mb-3.5">
                {col.title}
              </h4>
              <ul className="list-none flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[0.78rem] text-[var(--muted)] no-underline transition-colors hover:text-[var(--rg-light)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--border)] pt-5 flex flex-wrap justify-between gap-2.5">
        <span className="text-[0.62rem] text-[rgba(245,237,224,0.26)] tracking-[0.05em]">
          © 2026 UpSycle Market. All rights reserved.
        </span>
        <span className="text-[0.62rem] text-[rgba(245,237,224,0.26)] tracking-[0.05em]">
          Handmade · Upcycled · Sustainable
        </span>
      </div>
    </footer>
  );
}
