import Image from "next/image";
import Link from "next/link";
import CategoryNav from "@/components/CategoryNav";
import CartBadge from "@/components/cart/CartBadge";
import LogoutButton from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/current-user";
import { resolveSellerAuth } from "@/lib/seller-auth";
import { CATEGORY_TREE } from "@/lib/categories";

const navLinks = [
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#story", label: "Our Story" },
];

const authNavLinkClass =
  "text-[0.68rem] font-medium tracking-[0.13em] uppercase text-[rgba(245,237,224,0.4)] no-underline transition-colors hover:text-[var(--rg-light)]";

export default async function Header() {
  const user = await getCurrentUser();
  const isApprovedSeller = user ? (await resolveSellerAuth()).ok : false;

  return (
    <nav className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-between px-6 py-4 md:px-14 lg:px-20 xl:px-28 bg-[rgba(3,3,3,0.94)] backdrop-blur-[14px] border-b border-[var(--border)]">
      <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline md:gap-3">
        <Image
          src="/brand/mark.webp"
          alt="UpSycle Market"
          width={880}
          height={721}
          priority
          quality={90}
          sizes="(min-width: 768px) 52px, 36px"
          className="h-9 w-auto md:h-[52px]"
        />
        <Image
          src="/brand/wordmark.webp"
          alt=""
          width={960}
          height={340}
          quality={90}
          sizes="96px"
          className="hidden h-7 w-auto md:block"
        />
      </Link>
      <ul className="flex items-center gap-7 list-none">
        <li className="hidden md:block">
          <CategoryNav categories={CATEGORY_TREE} />
        </li>
        <li className="hidden lg:block">
          <form action="/browse" method="GET" className="flex items-center">
            <input
              type="search"
              name="q"
              placeholder="Search handcrafted pieces..."
              className="w-48 border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-[0.8rem] text-[var(--cream)] outline-none placeholder:text-[rgba(245,237,224,0.3)] focus:border-[var(--rg-core)]"
            />
          </form>
        </li>
        {navLinks.map((link) => (
          <li key={link.href} className="hidden md:block">
            <Link
              href={link.href}
              className="text-[0.68rem] font-medium tracking-[0.13em] uppercase text-[var(--muted)] no-underline transition-colors hover:text-[var(--rg-light)]"
            >
              {link.label}
            </Link>
          </li>
        ))}
        <li>
          <Link
            href={isApprovedSeller ? "/sell/products" : "/sell"}
            className="border border-[var(--rg-core)] text-[var(--rg-light)] px-5 py-2 text-[0.68rem] font-medium tracking-[0.13em] uppercase no-underline transition-all hover:bg-[var(--rg-core)] hover:text-[var(--black)]"
          >
            {isApprovedSeller ? "Seller Dashboard" : "Start Selling"}
          </Link>
        </li>
        {user ? (
          <>
            <li className="hidden md:block">
              <Link href="/account" className={authNavLinkClass}>
                {user.firstName ?? "Account"}
              </Link>
            </li>
            <li className="hidden md:block">
              <LogoutButton
                className={`${authNavLinkClass} cursor-pointer border-none bg-transparent p-0`}
              />
            </li>
          </>
        ) : (
          <li className="hidden md:block">
            <Link href="/login" className={authNavLinkClass}>
              Sign In
            </Link>
          </li>
        )}
        <li>
          <CartBadge />
        </li>
      </ul>
    </nav>
  );
}
