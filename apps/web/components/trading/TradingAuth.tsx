'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';

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

export function TradingAuthProvider({ children, session }: { children: ReactNode; session: PrivySession }) {
  return <PrivySessionContext.Provider value={session}>{children}</PrivySessionContext.Provider>;
}

export function useTradingAuth() {
  const privy = useContext(PrivySessionContext);
  const adapter = useWallet();
  const usePrivyWallet = privy.authenticated && Boolean(privy.walletAddress);
  const walletAddress = usePrivyWallet ? privy.walletAddress : adapter.publicKey?.toBase58() ?? null;

  const signTransaction = useCallback(async (encodedTransaction: string) => {
    const bytes = Uint8Array.from(atob(encodedTransaction), (character) => character.charCodeAt(0));
    let signed: Uint8Array;
    if (usePrivyWallet && privy.signTransaction) {
      signed = await privy.signTransaction(bytes);
    } else {
      if (!adapter.signTransaction) throw new Error('Connect a wallet that supports transaction signing.');
      const transaction = VersionedTransaction.deserialize(bytes);
      signed = (await adapter.signTransaction(transaction)).serialize();
    }
    return btoa(Array.from(signed, (byte) => String.fromCharCode(byte)).join(''));
  }, [adapter.signTransaction, privy.signTransaction, usePrivyWallet]);

  const logout = useCallback(async () => {
    await privy.logout();
    if (adapter.connected) await adapter.disconnect();
  }, [privy.logout, adapter.connected, adapter.disconnect]);

  return {
    configured: privy.configured,
    privyConfigured: privy.configured,
    privyAuthenticated: privy.authenticated,
    ready: privy.ready && !adapter.connecting,
    authenticated: privy.authenticated || adapter.connected,
    walletAddress,
    provider: usePrivyWallet ? 'privy' as const : adapter.connected ? 'wallet' as const : null,
    login: privy.login,
    logout,
    logOut: logout,
    signTransaction,
    canSign: usePrivyWallet ? Boolean(privy.signTransaction) : Boolean(adapter.signTransaction && adapter.connected),
  };
}
