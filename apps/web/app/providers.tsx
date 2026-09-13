"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { KiteProvider } from "../components/kite/State";
const WalletProviders = dynamic(() => import("./wallet-providers"), {
  ssr: false,
  loading: () => (
    <main className="system-screen" aria-busy="true">
      <section>
        <p className="eyebrow">KITE</p>
        <h1>Opening your workspace.</h1>
        <p className="muted">Connecting your market and wallet tools.</p>
      </section>
    </main>
  ),
});
export function Providers({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const workspace =
    [
      "/app",
      "/markets",
      "/baskets",
      "/sip",
      "/portfolio",
      "/orders",
      "/watchlist",
      "/settings",
    ].includes(path) ||
    path.startsWith("/stock/") ||
    path.startsWith("/basket/");
  if (!workspace && path !== "/" && path !== "/landing") return <>{children}</>;
  const publicPage = path === "/" || path === "/landing";
  return (
    <KiteProvider>
      {publicPage ? children : <WalletProviders>{children}</WalletProviders>}
    </KiteProvider>
  );
}
