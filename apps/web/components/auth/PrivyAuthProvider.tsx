"use client";

import { useMemo, type ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import {
  toSolanaWalletConnectors,
  useSignTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { TradingAuthProvider, type PrivySession } from "../trading/TradingAuth";

const connectors = toSolanaWalletConnectors({ shouldAutoConnect: false });

function SessionBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signTransaction } = useSignTransaction();
  const wallet =
    wallets.find((item) => item.standardWallet.name === "Privy") ?? wallets[0];
  const session = useMemo<PrivySession>(
    () => ({
      configured: true,
      // Login depends on authentication initialization, not wallet discovery.
      ready,
      authenticated,
      walletAddress:
        ready && authenticated && walletsReady && wallet
          ? wallet.address
          : null,
      login,
      logout,
      signTransaction:
        ready && authenticated && walletsReady && wallet
          ? async (transaction) => {
              const result = await signTransaction({
                transaction,
                wallet,
                chain: "solana:mainnet",
                options: { uiOptions: { showWalletUIs: true } },
              });
              return result.signedTransaction;
            }
          : null,
    }),
    [
      ready,
      walletsReady,
      authenticated,
      wallet,
      login,
      logout,
      signTransaction,
    ],
  );

  return (
    <TradingAuthProvider session={session}>{children}</TradingAuthProvider>
  );
}

export default function PrivyAuthProvider({
  children,
  appId,
  endpoint,
}: {
  children: ReactNode;
  appId: string;
  endpoint: string;
}) {
  const config = useMemo(
    () => ({
      appearance: {
        theme: "dark" as const,
        accentColor: "#D5F478" as const,
        walletChainType: "solana-only" as const,
      },
      loginMethods: ["email", "wallet"] as ("email" | "wallet")[],
      externalWallets: { solana: { connectors } },
      embeddedWallets: {
        solana: { createOnLogin: "users-without-wallets" as const },
      },
      solana: {
        rpcs: {
          "solana:mainnet": {
            rpc: createSolanaRpc(endpoint),
            rpcSubscriptions: createSolanaRpcSubscriptions(
              process.env.NEXT_PUBLIC_SOLANA_WS_URL ||
                endpoint.replace(/^http/, "ws"),
            ),
          },
        },
      },
    }),
    [endpoint],
  );

  return (
    <PrivyProvider appId={appId} config={config}>
      <SessionBridge>{children}</SessionBridge>
    </PrivyProvider>
  );
}
