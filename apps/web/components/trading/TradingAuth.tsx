"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { advertisedSigningVersions } from "@kite/sdk";

type Chain = "solana:mainnet" | "solana:devnet";
export interface PrivySession {
  configured: boolean;
  ready: boolean;
  authenticated: boolean;
  walletAddress: string | null;
  login: () => void;
  logout: () => Promise<void>;
  signTransaction:
    ((transaction: Uint8Array, chain?: Chain) => Promise<Uint8Array>) | null;
  signMessage?: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  supportedTransactionVersions?: readonly number[];
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
const Context = createContext<PrivySession>(unavailable);
export function TradingAuthProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: PrivySession;
}) {
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
const decode = (encoded: string) =>
  Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
const encode = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));

export function useTradingAuth() {
  const privy = useContext(Context),
    adapter = useWallet();
  const hasWalletProvider =
    !Object.getOwnPropertyDescriptor(adapter, "publicKey")?.get;
  const adapterPublicKey = hasWalletProvider ? adapter.publicKey : null;
  const adapterWallet = hasWalletProvider ? adapter.wallet : null;
  const isAdapterConnected = hasWalletProvider && adapter.connected;
  const usePrivyWallet =
    !isAdapterConnected && privy.authenticated && Boolean(privy.walletAddress);
  const walletAddress = usePrivyWallet
    ? privy.walletAddress
    : (adapterPublicKey?.toBase58() ?? null);
  const standard = (
    adapterWallet?.adapter as unknown as
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
  const feature = standard?.features["solana:signTransaction"] as
    | {
        supportedTransactionVersions?: readonly (number | string)[];
        signTransaction?: (
          ...inputs: {
            account: unknown;
            chain: string;
            transaction: Uint8Array;
          }[]
        ) => Promise<readonly { signedTransaction: Uint8Array }[]>;
      }
    | undefined;
  const account = standard?.accounts.find(
    (item) => item.address === walletAddress,
  );
  const standardVersions = advertisedSigningVersions(
    feature?.supportedTransactionVersions,
    Boolean(
      !usePrivyWallet &&
      isAdapterConnected &&
      account?.features?.includes("solana:signTransaction") &&
      feature?.signTransaction,
    ),
  );
  const adapterVersions = adapterWallet?.adapter.supportedTransactionVersions;
  // V1 is enabled only when explicitly advertised by Wallet Standard.
  const supportedTransactionVersions = usePrivyWallet
    ? advertisedSigningVersions(
        privy.supportedTransactionVersions,
        Boolean(privy.signTransaction),
      )
    : Array.from(
        new Set([
          ...standardVersions,
          ...(isAdapterConnected &&
          adapter.signTransaction &&
          adapterVersions?.has(0)
            ? [0]
            : []),
        ]),
      );
  const canSignV0 = supportedTransactionVersions.includes(0),
    canSignV1 = supportedTransactionVersions.includes(1);
  const signTransactions = useCallback(
    async (
      encoded: string[],
      version: 0 | 1 = 0,
      chain: Chain = "solana:mainnet",
    ) => {
      if (!encoded.length || encoded.length > 5)
        throw new Error("Review between one and five transactions.");
      if (version === 0 ? !canSignV0 : !canSignV1)
        throw new Error(
          `This wallet has not advertised v${version} transaction signing.`,
        );
      const bytes = encoded.map(decode);
      if (usePrivyWallet && privy.signTransaction) {
        const signed: string[] = [];
        for (const transaction of bytes)
          signed.push(encode(await privy.signTransaction(transaction, chain)));
        return signed;
      }
      if (
        standardVersions.includes(version) &&
        feature?.signTransaction &&
        account?.features?.includes("solana:signTransaction")
      ) {
        if (account.chains && !account.chains.includes(chain))
          throw new Error(
            "Select the requested network in your wallet before signing.",
          );
        const signed = await feature.signTransaction(
          ...bytes.map((transaction) => ({ account, chain, transaction })),
        );
        if (signed.length !== bytes.length)
          throw new Error(
            "The wallet did not sign every reviewed transaction.",
          );
        return signed.map((item) => encode(item.signedTransaction));
      }
      if (version !== 0)
        throw new Error(
          "V1 signing requires an explicitly compatible Wallet Standard wallet.",
        );
      if (chain !== "solana:mainnet")
        throw new Error(
          "This wallet does not expose explicit devnet signing. Use a Wallet Standard wallet.",
        );
      const transactions = bytes.map((transaction) =>
        VersionedTransaction.deserialize(transaction),
      );
      if (adapter.signAllTransactions && transactions.length > 1)
        return (await adapter.signAllTransactions(transactions)).map(
          (transaction) => encode(transaction.serialize()),
        );
      if (!adapter.signTransaction)
        throw new Error("Connect a wallet that supports transaction signing.");
      const signed: string[] = [];
      for (const transaction of transactions)
        signed.push(
          encode((await adapter.signTransaction(transaction)).serialize()),
        );
      return signed;
    },
    [
      account,
      adapter.signAllTransactions,
      adapter.signTransaction,
      canSignV0,
      canSignV1,
      feature,
      standardVersions.join(","),
      privy.signTransaction,
      usePrivyWallet,
    ],
  );
  const signTransaction = useCallback(
    async (
      encoded: string,
      version: 0 | 1 = 0,
      chain: Chain = "solana:mainnet",
    ) => (await signTransactions([encoded], version, chain))[0],
    [signTransactions],
  );
  const signMessage = useCallback(
    async (message: string) => {
      const bytes = new TextEncoder().encode(message);
      if (usePrivyWallet && privy.signMessage)
        return encode(await privy.signMessage(bytes));
      if (!isAdapterConnected || !adapter.signMessage)
        throw new Error(
          "Connect a wallet with message signing to publish a basket.",
        );
      return encode(await adapter.signMessage(bytes));
    },
    [isAdapterConnected, adapter.signMessage, privy.signMessage, usePrivyWallet],
  );
  const logout = useCallback(async () => {
    await privy.logout();
    if (isAdapterConnected) await adapter.disconnect();
  }, [privy.logout, isAdapterConnected, adapter.disconnect]);
  return {
    configured: privy.configured,
    privyConfigured: privy.configured,
    privyAuthenticated: privy.authenticated,
    ready: privy.ready,
    authenticated: privy.authenticated || isAdapterConnected,
    walletAddress,
    provider: usePrivyWallet
      ? ("privy" as const)
      : isAdapterConnected
        ? ("wallet" as const)
        : null,
    login: privy.login,
    logout,
    logOut: logout,
    signTransaction,
    signTransactions,
    signMessage,
    canSignMessage: usePrivyWallet
      ? Boolean(privy.signMessage)
      : Boolean(isAdapterConnected && adapter.signMessage),
    supportedTransactionVersions,
    supportsV1: canSignV1,
    canSignV1,
    canSignV0,
    canSign: canSignV0 || canSignV1,
  };
}
