import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "./providers";
import { ThemeProvider } from "../components/kite/ThemeMode";
import { PrivacyChoices } from "../components/kite/PrivacyChoices";
import { siteUrl } from "../lib/site";
import { socialPreview } from "../lib/metadata";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "Kite",
    template: "Kite | %s",
  },
  description:
    "Research tokenized stocks, build a basket and invest from your own wallet on Solana. Mainnet spot purchases, a vaultless devnet SIP/DCA demo and paper practice.",
  openGraph: {
    type: "website",
    siteName: "Kite",
    title: "Kite",
    description:
      "Research companies. Invest in stock baskets. Keep custody in your wallet. Explore mainnet purchases and Kite’s vaultless recurring test-token demo.",
    images: [socialPreview],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kite",
    images: [socialPreview],
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script
          // Keep the first paint aligned with a saved user preference.
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var storedTheme;
                  try { storedTheme = localStorage.getItem("kite-theme"); } catch {}
                  var theme = storedTheme === "light" || storedTheme === "dark"
                    ? storedTheme
                    : (window.matchMedia("(prefers-color-scheme: dark)").matches
                        ? "dark"
                        : "light");
                  document.documentElement.setAttribute("data-theme", theme);
                  document.documentElement.style.colorScheme = theme;
                } catch {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <ThemeProvider>
          <Providers>{children}</Providers>
          <PrivacyChoices />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
