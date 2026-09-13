import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import {
  createKiteCore,
  type MarketSnapshot,
  type PaperAccount,
} from "@kite/sdk";
import { kiteClient } from "../lib/config";

type KiteContextValue = {
  market: MarketSnapshot | null;
  account: PaperAccount;
  watchlist: string[];
  loading: boolean;
  ready: boolean;
  error: string | null;
  storageError: string | null;
  refresh: () => Promise<void>;
  updateAccount: (update: (account: PaperAccount) => PaperAccount) => void;
  toggleWatch: (mint: string) => void;
  resetAccount: () => void;
};
const KiteContext = createContext<KiteContextValue | null>(null);

export function KiteProvider({ children }: { children: ReactNode }) {
  const [core] = useState(() =>
    createKiteCore({
      storage: AsyncStorage,
      client: kiteClient,
      accountKey: "kite.mobile.paper.v1",
      watchlistKey: "kite.mobile.watchlist.v1",
    }),
  );
  const state = useSyncExternalStore(
    core.subscribe,
    core.getSnapshot,
    core.getSnapshot,
  );
  useEffect(() => {
    core.setActive(
      AppState.currentState !== "background" &&
        AppState.currentState !== "inactive",
    );
    core.start();
    const listener = AppState.addEventListener("change", (value) =>
      core.setActive(value === "active"),
    );
    return () => {
      listener.remove();
      core.stop();
    };
  }, [core]);
  return (
    <KiteContext.Provider
      value={{
        ...state,
        ready: state.hydrated && !state.accountReadFailed,
        refresh: core.refresh,
        updateAccount: core.updateAccount,
        toggleWatch: core.toggleWatch,
        resetAccount: core.resetAccount,
      }}
    >
      {children}
    </KiteContext.Provider>
  );
}
export function useKite() {
  const context = useContext(KiteContext);
  if (!context) throw new Error("useKite must be used within KiteProvider.");
  return context;
}
