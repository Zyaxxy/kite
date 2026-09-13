"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

const LoadingWallet = () => (
  <main className="system-screen" aria-busy="true">
    <section>
      <p className="eyebrow">KITE</p>
      <h1>Opening your workspace.</h1>
      <p className="muted">Preparing sign-in and wallet connections.</p>
    </section>
  </main>
);

const WalletModalProvider = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (module) => module.WalletModalProvider,
    ),
  { ssr: false, loading: LoadingWallet },
);
const PrivyAuthProvider = dynamic(
  () => import("../components/auth/PrivyAuthProvider"),
  { ssr: false, loading: LoadingWallet },
);

export default function WalletProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  // Modern Wallet Standard auto-discovers Phantom, Solflare, Backpack, etc.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {privyAppId ? (
            <PrivyAuthProvider appId={privyAppId} endpoint={endpoint}>
              {children}
            </PrivyAuthProvider>
          ) : (
            children
          )}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
