import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "./providers";
import { ThemeProvider } from "../components/kite/ThemeMode";
import { PrivacyChoices } from "../components/kite/PrivacyChoices";
import { siteUrl } from "../lib/site";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "Kite — Good ideas deserve a routine.",
    template: "%s | Kite",
  },
  description:
    "Build thematic stock baskets and an investing routine on Solana. Explore mainnet purchases, devnet subscriptions and paper practice with Kite.",
  openGraph: {
    type: "website",
    siteName: "Kite",
    title: "Kite — Good ideas deserve a routine.",
    description:
      "Choose a basket, set your rhythm and keep control. Mainnet tokenized assets, devnet recurring plans and invited creator collections.",
  },
  twitter: { card: "summary_large_image" },
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
