import type { Metadata } from "next";
import { Providers } from "./providers";
import { PrivacyChoices } from "../components/kite/PrivacyChoices";
import { siteUrl } from "../lib/site";
import "./wallet-adapter.css";
import "./globals.css";
import "./navigation-redesign.css";
import "./discover-redesign.css";
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "Kite — Your ideas. Onchain.", template: "%s | Kite" },
  description:
    "Discover companies, follow market news, and bring your tokenized investments together on Solana.",
  openGraph: {
    type: "website",
    siteName: "Kite",
    title: "Kite — Your ideas. Onchain.",
    description:
      "Your ideas. Your next move. Your Kite. Explore tokenized equities, baskets, and recurring investments on Solana.",
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
