"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createKiteCore, executePaperOrder, executePaperSwap, valuePaperAccount, executePaperBasket, createPaperPlan, togglePaperPlan } from "@kite/sdk";
import type { MarketAsset, MarketSnapshot, PaperAccount, MarketBasket, PaperPlan } from "@kite/sdk";
import { kiteClient } from "./api-client";

type Mode = "paper" | "actual";
type Portfolio = ReturnType<typeof valuePaperAccount>;
interface KiteState {
  snapshot: MarketSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  paper: PaperAccount;
  portfolio: Portfolio;
  hydrated: boolean;
  accountReadFailed: boolean;
  mode: Mode;
  setMode: (mode: Mode) => void;
  watchlist: string[];
  toggleWatch: (mint: string) => void;
  trade: (asset: MarketAsset, side: "buy" | "sell", amountUsd: number) => void;
  swap: (
    inputAsset: MarketAsset,
    outputAsset: MarketAsset,
    inputQuantity: number,
  ) => void;
  tradeBasket: (basket: MarketBasket, amountUsd: number) => void;
  createPlan: (
    input: Pick<
      PaperPlan,
      "targetId" | "targetType" | "name" | "amountUsd" | "frequency"
    >,
  ) => void;
  togglePlan: (id: string) => void;
  resetPaper: () => void;
  toast: string | null;
  notify: (message: string) => void;
  clearToast: () => void;
  storageError: string | null;
}
const Context = createContext<KiteState | null>(null);
export function KiteProvider({ children }: { children: React.ReactNode }) {
  const [core] = useState(() => createKiteCore({
    client: kiteClient,
    storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
    accountKey: "kite.paper.mainnet.v1", watchlistKey: "kite.watchlist.mainnet.v1",
  }));
  const state = useSyncExternalStore(core.subscribe, core.getSnapshot, core.getSnapshot);
  const [mode, setMode] = useState<Mode>("paper");
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const visibility = () => core.setActive(document.visibilityState === "visible");
    visibility(); core.start();
    document.addEventListener("visibilitychange", visibility);
    return () => { document.removeEventListener("visibilitychange", visibility); core.stop(); };
  }, [core]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const refresh = useCallback(() => core.refresh(), [core]);
  const trade = useCallback((asset: MarketAsset, side: "buy" | "sell", amountUsd: number) => {
    core.updateAccount(account => executePaperOrder(account, asset, side, amountUsd));
    setToast(`Paper ${side} recorded for ${asset.symbol}.`);
  }, [core]);
  const swap = useCallback((input: MarketAsset, output: MarketAsset, quantity: number) => {
    core.updateAccount(account => executePaperSwap(account, input, output, quantity));
    setToast(`Paper swap recorded: ${input.symbol} to ${output.symbol}.`);
  }, [core]);
  const tradeBasket = useCallback((basket: MarketBasket, amountUsd: number) => {
    core.updateAccount(account => executePaperBasket(account, basket, amountUsd));
    setToast("Paper basket purchase recorded.");
  }, [core]);
  const createPlan = useCallback((input: Pick<PaperPlan, "targetId" | "targetType" | "name" | "amountUsd" | "frequency">) => {
    core.updateAccount(account => createPaperPlan(account, input));
    setToast("Recurring paper plan created.");
  }, [core]);
  const togglePlan = useCallback((id: string) => core.updateAccount(account => togglePaperPlan(account, id)), [core]);
  const portfolio = useMemo(() => valuePaperAccount(state.account, state.market?.assets ?? []), [state.account, state.market]);
  const value: KiteState = {
    snapshot: state.market, paper: state.account, portfolio,
    loading: state.loading, error: state.error, hydrated: state.hydrated,
    accountReadFailed: state.accountReadFailed, storageError: state.storageError,
    mode, setMode, toast, notify: setToast, clearToast: () => setToast(null),
    watchlist: state.watchlist, toggleWatch: core.toggleWatch,
    refresh, trade, swap, tradeBasket, createPlan, togglePlan,
    resetPaper: () => { core.resetAccount(); setToast("Paper account reset."); },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useKite() {
  const value = useContext(Context);
  if (!value) throw new Error("useKite must be used within KiteProvider");
  return value;
}
