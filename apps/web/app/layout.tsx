import type { Metadata } from "next";
import { Providers } from "./providers";
import { ThemeProvider } from "../components/kite/ThemeMode";
import { PrivacyChoices } from "../components/kite/PrivacyChoices";
import { siteUrl } from "../lib/site";
import "./wallet-adapter.css";
import "./globals.css";
import "./navigation-redesign.css";
import "./discover-redesign.css";
import "./theme-surfaces.css";
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
        <ThemeProvider>
          <Providers>{children}</Providers>
          <PrivacyChoices />
        </ThemeProvider>
      </body>
    </html>
  );
}
