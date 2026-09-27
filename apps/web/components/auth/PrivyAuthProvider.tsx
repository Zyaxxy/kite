"use client";

import { useMemo, type ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import {
  toSolanaWalletConnectors,
  useSignTransaction,
  useSignMessage,
  useWallets,
} from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { TradingAuthProvider, type PrivySession } from "../trading/TradingAuth";
import { useTheme } from "../kite/ThemeMode";

const connectors = toSolanaWalletConnectors({ shouldAutoConnect: false });

function SessionBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { signMessage } = useSignMessage();
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
          ? async (transaction, chain = "solana:mainnet") => {
              const result = await signTransaction({
                transaction,
                wallet,
                chain,
                options: { uiOptions: { showWalletUIs: true } },
              });
              return result.signedTransaction;
            }
          : null,
      signMessage:
        ready && authenticated && walletsReady && wallet
          ? async (message) =>
              (await signMessage({ message, wallet })).signature
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
      signMessage,
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
  const { theme } = useTheme();
  const solana = useMemo(
    () => ({
      rpcs: {
        "solana:devnet": {
          rpc: createSolanaRpc("https://api.devnet.solana.com"),
          rpcSubscriptions: createSolanaRpcSubscriptions(
            "wss://api.devnet.solana.com",
          ),
        },
        "solana:mainnet": {
          rpc: createSolanaRpc(endpoint),
          rpcSubscriptions: createSolanaRpcSubscriptions(
            process.env.NEXT_PUBLIC_SOLANA_WS_URL ||
              endpoint.replace(/^http/, "ws"),
          ),
        },
      },
    }),
    [endpoint],
  );
  const config = useMemo(
    () => ({
      appearance: {
        theme,
        accentColor: (theme === "light"
          ? "#426C2F"
          : "#D5F478") as `#${string}`,
        walletChainType: "solana-only" as const,
      },
      loginMethods: ["email", "wallet"] as ("email" | "wallet")[],
      externalWallets: { solana: { connectors } },
      embeddedWallets: {
        solana: { createOnLogin: "users-without-wallets" as const },
      },
      solana,
    }),
    [solana, theme],
  );

  return (
    <PrivyProvider appId={appId} config={config}>
      <SessionBridge>{children}</SessionBridge>
    </PrivyProvider>
  );
}
