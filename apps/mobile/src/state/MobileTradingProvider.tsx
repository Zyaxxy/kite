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
  type BasketPurchaseOrder,
  type BasketBundleExecution,
} from "@kite/sdk";
import {
  connectMobileWallet,
  disconnectMobileWallet,
  restoreMobileWallet,
  signMobileTransaction,
  signMobileTransactions,
  supportsMobileWallet,
  type MobileWalletAccount,
} from "../lib/mobile-wallet";
import { kiteClient } from "../lib/config";

const PENDING_KEY = "kite.mobile.pending-mainnet.v1";
const ACTIVITY_KEY = "kite.mobile.wallet-activity.v1";
export interface MobileActivity {
  id: string;
  walletAddress: string;
  network: "mainnet" | "devnet";
  title: string;
  status: string;
  createdAt: number;
  signatures: string[];
}
interface PendingAttempt {
  walletAddress: string;
  requestId: string;
  createdAt: number;
  bundle?: {
    signedTransactions: string[];
    authorization: string;
    bundleId?: string;
    statusAuthorization?: string;
  };
}
interface MobileTradingState {
  account: MobileWalletAccount | null;
  supported: boolean;
  supportedTransactionVersions: number[];
  canSignV1: boolean;
  canSignV0: boolean;
  ready: boolean;
  busy: boolean;
  pending: PendingAttempt | null;
  error: string | null;
  activity: MobileActivity[];
  recordActivity(value: MobileActivity): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  acknowledgePending(): Promise<void>;
  execute(order: SignableWalletOrder): Promise<MainnetTradeResult>;
  executeBasket(
    order: BasketPurchaseOrder,
  ): Promise<MainnetTradeResult | BasketBundleExecution>;
  checkBundle(): Promise<BasketBundleExecution>;
}
const Context = createContext<MobileTradingState | null>(null);

export function MobileTradingProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<MobileWalletAccount | null>(null);
  const [pending, setPending] = useState<PendingAttempt | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<MobileActivity[]>([]);
  const activityRef = useRef<MobileActivity[]>([]);
  const accountRef = useRef(account);
  accountRef.current = account;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      restoreMobileWallet(),
      AsyncStorage.getItem(PENDING_KEY),
      AsyncStorage.getItem(ACTIVITY_KEY),
    ])
      .then(([savedAccount, raw, history]) => {
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
          if (
            attempt.bundle &&
            (typeof attempt.bundle.authorization !== "string" ||
              !attempt.bundle.authorization ||
              !Array.isArray(attempt.bundle.signedTransactions) ||
              attempt.bundle.signedTransactions.length < 2 ||
              attempt.bundle.signedTransactions.length > 3 ||
              attempt.bundle.signedTransactions.some(
                (transaction) =>
                  typeof transaction !== "string" ||
                  transaction.length > 8192 ||
                  !/^[A-Za-z0-9+/]+={0,2}$/.test(transaction),
              ))
          )
            throw new Error(
              "Unreadable pending basket bundle. Check wallet activity before clearing device storage.",
            );
          pendingRef.current = attempt;
          setPending(attempt);
        }
        if (history) {
          const records = JSON.parse(history) as MobileActivity[];
          if (
            !Array.isArray(records) ||
            records.some(
              (item) =>
                !item ||
                typeof item.id !== "string" ||
                typeof item.walletAddress !== "string" ||
                typeof item.title !== "string" ||
                typeof item.status !== "string" ||
                !["devnet", "mainnet"].includes(item.network) ||
                !Number.isSafeInteger(item.createdAt) ||
                !Array.isArray(item.signatures) ||
                item.signatures.some(
                  (signature) => typeof signature !== "string",
                ),
            )
          )
            throw new Error("Wallet activity storage is unreadable.");
          activityRef.current = records;
          setActivity(records);
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

  const recordActivity = useCallback(async (value: MobileActivity) => {
    const records = [
      value,
      ...activityRef.current.filter((item) => item.id !== value.id),
    ].slice(0, 100);
    await AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(records));
    activityRef.current = records;
    setActivity(records);
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
        await recordActivity({
          id: order.requestId,
          walletAddress: order.taker,
          network: "mainnet",
          title: "Wallet swap",
          status: result.status,
          createdAt: Date.now(),
          signatures: result.signature ? [result.signature] : [],
        });
        return result;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [ready, recordActivity],
  );
  const executeBasket = useCallback(
    async (order: BasketPurchaseOrder) => {
      if (!("transactions" in order)) return execute(order);
      if (!ready || busyRef.current || pendingRef.current)
        throw new Error(
          "Resolve the existing wallet request before placing another basket order.",
        );
      busyRef.current = true;
      setBusy(true);
      try {
        if (accountRef.current?.address !== order.taker)
          throw new Error("The connected wallet changed. Review again.");
        const signedTransactions = await signMobileTransactions({
          signer: order.taker,
          network: "mainnet",
          transactionVersion: 0,
          transactions: order.transactions,
          expiresAt: order.expiresAt,
        });
        if (
          accountRef.current?.address !== order.taker ||
          order.expiresAt <= Date.now()
        )
          throw new Error(
            "The wallet changed or review expired. Nothing was submitted.",
          );
        const attempt: PendingAttempt = {
          walletAddress: order.taker,
          requestId: order.requestId,
          createdAt: Date.now(),
          bundle: { signedTransactions, authorization: order.authorization },
        };
        await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(attempt));
        pendingRef.current = attempt;
        setPending(attempt);
        const result = await kiteClient.executeBundle(attempt.bundle!);
        if (result.status === "Success" || result.status === "Failed") {
          await AsyncStorage.removeItem(PENDING_KEY);
          pendingRef.current = null;
          setPending(null);
        } else {
          attempt.bundle = {
            ...attempt.bundle!,
            bundleId: result.bundleId,
            statusAuthorization: result.statusAuthorization,
          };
          await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(attempt));
          pendingRef.current = attempt;
          setPending(attempt);
        }
        await recordActivity({
          id: order.requestId,
          walletAddress: order.taker,
          network: "mainnet",
          title: "Basket purchase",
          status: result.status,
          createdAt: attempt.createdAt,
          signatures: result.signatures,
        });
        return result;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [ready, execute, recordActivity],
  );
  const checkBundle = useCallback(async () => {
    const attempt = pendingRef.current;
    if (!attempt?.bundle || busyRef.current)
      throw new Error("No pending basket bundle is available.");
    busyRef.current = true;
    setBusy(true);
    try {
      const result = attempt.bundle.statusAuthorization
        ? await kiteClient.getBundleStatus({
            bundleId: attempt.bundle.bundleId,
            authorization: attempt.bundle.statusAuthorization,
          })
        : await kiteClient.recoverBundle(attempt.bundle);
      if (result.status === "Success" || result.status === "Failed") {
        await AsyncStorage.removeItem(PENDING_KEY);
        pendingRef.current = null;
        setPending(null);
      }
      await recordActivity({
        id: attempt.requestId,
        walletAddress: attempt.walletAddress,
        network: "mainnet",
        title: "Basket purchase",
        status: result.status,
        createdAt: attempt.createdAt,
        signatures: result.signatures,
      });
      return result;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [recordActivity]);
  return (
    <Context.Provider
      value={{
        account,
        supported: supportsMobileWallet,
        supportedTransactionVersions:
          account?.supportedTransactionVersions ?? [],
        canSignV1: account?.supportedTransactionVersions?.includes(1) === true,
        canSignV0: account?.supportedTransactionVersions?.includes(0) === true,
        ready,
        busy,
        pending,
        error,
        activity,
        recordActivity,
        connect,
        disconnect,
        acknowledgePending,
        execute,
        executeBasket,
        checkBundle,
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
