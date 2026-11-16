import type { Metadata } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const description =
  "A marketplace for handmade and upcycled goods. Discover one-of-a-kind pieces from independent artists, or open your own shop.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.upsyclemarket.com"),
  title: "UpSycle Market — Created By US, Treasured By You",
  description,
  openGraph: {
    title: "UpSycle Market — Created By US, Treasured By You",
    description,
    siteName: "UpSycle Market",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "UpSycle Market",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "UpSycle Market — Created By US, Treasured By You",
    description,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "UpSycle Market",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
