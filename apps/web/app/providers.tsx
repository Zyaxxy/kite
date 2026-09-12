"use client";

import React, { useMemo } from "react";
import { KiteProvider } from "../components/kite/State";
import dynamic from "next/dynamic";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

const WalletModalProvider = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (module) => module.WalletModalProvider,
    ),
  { ssr: false },
);
const PrivyAuthProvider = dynamic(
  () => import("../components/auth/PrivyAuthProvider"),
  { ssr: false },
);

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  // Modern Wallet Standard auto-discovers Phantom, Solflare, Backpack, etc.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <KiteProvider>
            {privyAppId ? (
              <PrivyAuthProvider appId={privyAppId} endpoint={endpoint}>
                {children}
              </PrivyAuthProvider>
            ) : (
              children
            )}
          </KiteProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
