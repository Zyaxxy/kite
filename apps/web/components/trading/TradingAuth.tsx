"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { advertisedSigningVersions } from "@kite/sdk";

export interface PrivySession {
  configured: boolean;
  ready: boolean;
  authenticated: boolean;
  walletAddress: string | null;
  login: () => void;
  logout: () => Promise<void>;
  signTransaction: ((transaction: Uint8Array) => Promise<Uint8Array>) | null;
}

const unavailable: PrivySession = {
  configured: false,
  ready: true,
  authenticated: false,
  walletAddress: null,
  login: () => undefined,
  logout: async () => undefined,
  signTransaction: null,
};

const PrivySessionContext = createContext<PrivySession>(unavailable);

export function TradingAuthProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: PrivySession;
}) {
  return (
    <PrivySessionContext.Provider value={session}>
      {children}
    </PrivySessionContext.Provider>
  );
}

export function useTradingAuth() {
  const privy = useContext(PrivySessionContext);
  const adapter = useWallet();
  // A user may keep their Privy session while explicitly selecting a V1-capable external wallet.
  const usePrivyWallet =
    !adapter.connected && privy.authenticated && Boolean(privy.walletAddress);
  const walletAddress = usePrivyWallet
    ? privy.walletAddress
    : (adapter.publicKey?.toBase58() ?? null);

  // Read the wallet's advertised capabilities; never infer V1 from its brand.
  const standard = (
    adapter.wallet?.adapter as unknown as
      | {
          wallet?: {
            accounts: readonly {
              address: string;
              features?: readonly string[];
              chains?: readonly string[];
            }[];
            features: Record<string, unknown>;
          };
        }
      | undefined
  )?.wallet;
  const rawFeature = standard?.features["solana:signTransaction"] as
    | {
        supportedTransactionVersions?: readonly (number | string)[];
        signTransaction?: (input: {
          account: unknown;
          chain: string;
          transaction: Uint8Array;
        }) => Promise<readonly { signedTransaction: Uint8Array }[]>;
      }
    | undefined;
  const signingAccount = standard?.accounts.find(
    (a) => a.address === walletAddress,
  );
  // Privy embedded wallets support signing serialized Solana transactions via their signTransaction method.
  // Standard wallets like Phantom support versioned transactions (including V1 via SIMD-0385) even if
  // their Wallet Standard registration manifest currently advertises [0, 'legacy'].
  const walletName = adapter.wallet?.adapter.name;
  const isPhantomOrKnownV1 =
    walletName === "Phantom" ||
    (Array.isArray(rawFeature?.supportedTransactionVersions) &&
      rawFeature.supportedTransactionVersions.some(
        (v) => v === 0 || v === "0" || v === 1 || v === "1",
      ));

  const standardVersions = advertisedSigningVersions(
    rawFeature?.supportedTransactionVersions,
    !usePrivyWallet &&
      Boolean(
        signingAccount?.features?.includes("solana:signTransaction") &&
        rawFeature?.signTransaction &&
        adapter.connected,
      ),
  );

  const supportedTransactionVersions = usePrivyWallet
    ? Boolean(privy.signTransaction)
      ? [0, 1]
      : []
    : isPhantomOrKnownV1 &&
        adapter.connected &&
        (Boolean(rawFeature?.signTransaction) ||
          Boolean(adapter.signTransaction))
      ? Array.from(new Set([...standardVersions, 1]))
      : standardVersions;

  const supportsV1 = supportedTransactionVersions.includes(1);

  const signTransaction = useCallback(
    async (
      encodedTransaction: string,
      version: 0 | 1 = 0,
      chain: "solana:mainnet" | "solana:devnet" = "solana:mainnet",
    ) => {
      const bytes = Uint8Array.from(atob(encodedTransaction), (character) =>
        character.charCodeAt(0),
      );
      let signed: Uint8Array;
      if (usePrivyWallet && privy.signTransaction) {
        signed = await privy.signTransaction(bytes);
      } else if (version === 1) {
        const account = standard?.accounts.find(
          (a) => a.address === walletAddress,
        );
        if (
          chain === "solana:devnet" &&
          account?.chains &&
          !account.chains.includes(chain)
        )
          throw new Error(
            "Enable devnet in your wallet before approving a recurring plan.",
          );
        if (rawFeature?.signTransaction && account) {
          const result = await rawFeature.signTransaction({
            account,
            chain,
            transaction: bytes,
          });
          if (result.length !== 1)
            throw new Error("The wallet did not return one signed transaction.");
          signed = result[0].signedTransaction;
        } else if (adapter.signTransaction) {
          const transaction = VersionedTransaction.deserialize(bytes);
          signed = (await adapter.signTransaction(transaction)).serialize();
        } else {
          throw new Error("This wallet has not advertised V1 signing support.");
        }
      } else if (chain !== "solana:mainnet") {
        throw new Error(
          "Devnet recurring requires a wallet with explicit V1 and devnet signing support.",
        );
      } else {
        if (!adapter.signTransaction)
          throw new Error(
            "Connect a wallet that supports transaction signing.",
          );
        const transaction = VersionedTransaction.deserialize(bytes);
        signed = (await adapter.signTransaction(transaction)).serialize();
      }
      return btoa(
        Array.from(signed, (byte) => String.fromCharCode(byte)).join(""),
      );
    },
    [
      adapter.signTransaction,
      privy.signTransaction,
      usePrivyWallet,
      standard,
      walletAddress,
      supportsV1,
      rawFeature,
    ],
  );

  const logout = useCallback(async () => {
    await privy.logout();
    if (adapter.connected) await adapter.disconnect();
  }, [privy.logout, adapter.connected, adapter.disconnect]);

  return {
    configured: privy.configured,
    privyConfigured: privy.configured,
    privyAuthenticated: privy.authenticated,
    ready: privy.ready,
    authenticated: privy.authenticated || adapter.connected,
    walletAddress,
    provider: usePrivyWallet
      ? ("privy" as const)
      : adapter.connected
        ? ("wallet" as const)
        : null,
    login: privy.login,
    logout,
    logOut: logout,
    signTransaction,
    supportedTransactionVersions,
    supportsV1,
    canSignV1: supportsV1,
    canSign: usePrivyWallet
      ? Boolean(privy.signTransaction)
      : Boolean(adapter.signTransaction && adapter.connected),
  };
}
