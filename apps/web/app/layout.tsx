import type { Metadata } from "next";
import { Providers } from "./providers";
import { PrivacyChoices } from "../components/kite/PrivacyChoices";
import { siteUrl } from "../lib/site";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "Kite — Your ideas. Onchain.", template: "%s | Kite" },
  description:
    "Explore tokenized equities and thematic baskets on Solana. Practice with live market prices, then trade from your own wallet.",
  openGraph: {
    type: "website",
    siteName: "Kite",
    title: "Kite — Your ideas. Onchain.",
    description:
      "Tokenized equities and thematic baskets on Solana. Start with live prices and paper trading.",
  },
  twitter: { card: "summary_large_image" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Providers>{children}</Providers>
        <PrivacyChoices />
      </body>
    </html>
  );
}
