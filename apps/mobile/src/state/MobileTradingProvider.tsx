import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  signAndExecuteMobileOrder,
  type SignableWalletOrder,
  type MainnetTradeResult,
} from "@kite/sdk";
import {
  connectMobileWallet,
  disconnectMobileWallet,
  restoreMobileWallet,
  signMobileTransaction,
  supportsMobileWallet,
  type MobileWalletAccount,
} from "../lib/mobile-wallet";
import { kiteClient } from "../lib/config";

const PENDING_KEY = "kite.mobile.pending-mainnet.v1";
interface PendingAttempt {
  walletAddress: string;
  requestId: string;
  createdAt: number;
}
interface MobileTradingState {
  account: MobileWalletAccount | null;
  supported: boolean;
  supportedTransactionVersions: number[];
  canSignV1: boolean;
  ready: boolean;
  busy: boolean;
  pending: PendingAttempt | null;
  error: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  acknowledgePending(): Promise<void>;
  execute(order: SignableWalletOrder): Promise<MainnetTradeResult>;
}
const Context = createContext<MobileTradingState | null>(null);

export function MobileTradingProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<MobileWalletAccount | null>(null);
  const [pending, setPending] = useState<PendingAttempt | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountRef = useRef(account);
  accountRef.current = account;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([restoreMobileWallet(), AsyncStorage.getItem(PENDING_KEY)])
      .then(([savedAccount, raw]) => {
        if (!active) return;
        if (raw) {
          const attempt = JSON.parse(raw) as PendingAttempt;
          if (
            typeof attempt.walletAddress !== "string" ||
            typeof attempt.requestId !== "string" ||
            typeof attempt.createdAt !== "number"
          )
            throw new Error(
              "Unreadable pending swap. Check wallet activity before clearing device storage.",
            );
          pendingRef.current = attempt;
          setPending(attempt);
        }
        accountRef.current = savedAccount;
        setAccount(savedAccount);
        setReady(true);
      })
      .catch(() => {
        if (active)
          setError(
            "Wallet storage could not be read. Reopen Kite and check wallet activity before starting another actual swap.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const connect = useCallback(async () => {
    if (!ready || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const value = await connectMobileWallet();
      accountRef.current = value;
      setAccount(value);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Wallet connection was not completed.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [ready]);
  const disconnect = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await disconnectMobileWallet();
    } catch {
      setError(
        "This device forgot the session. You can remove Kite’s authorization in your wallet settings.",
      );
    } finally {
      accountRef.current = null;
      setAccount(null);
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  const acknowledgePending = useCallback(async () => {
    if (busyRef.current) return;
    await AsyncStorage.removeItem(PENDING_KEY);
    pendingRef.current = null;
    setPending(null);
  }, []);
  const execute = useCallback(
    async (order: SignableWalletOrder) => {
      if (!ready || busyRef.current || pendingRef.current)
        throw new Error(
          "Resolve the existing wallet request before placing another swap.",
        );
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await signAndExecuteMobileOrder(
          order,
          order.transactionVersion === undefined
            ? kiteClient
            : {
                executeTrade: (request) =>
                  kiteClient.executeTransaction(request),
              },
          {
            getAddress: () => accountRef.current?.address ?? null,
            signTransaction: signMobileTransaction,
          },
          {
            beforeExecute: async (attempt) => {
              const value = { ...attempt, createdAt: Date.now() };
              await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(value));
              pendingRef.current = value;
              setPending(value);
            },
          },
        );
        if (result.status !== "Unknown") {
          await AsyncStorage.removeItem(PENDING_KEY);
          pendingRef.current = null;
          setPending(null);
        }
        return result;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [ready],
  );
  return (
    <Context.Provider
      value={{
        account,
        supported: supportsMobileWallet,
        supportedTransactionVersions:
          account?.supportedTransactionVersions ?? [],
        canSignV1: account?.supportedTransactionVersions?.includes(1) === true,
        ready,
        busy,
        pending,
        error,
        connect,
        disconnect,
        acknowledgePending,
        execute,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useMobileTrading() {
  const value = useContext(Context);
  if (!value)
    throw new Error("useMobileTrading requires MobileTradingProvider.");
  return value;
}
