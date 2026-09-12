"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createPaperAccount,
  executePaperOrder,
  valuePaperAccount,
  executePaperBasket,
  createPaperPlan,
  togglePaperPlan,
  runDuePaperPlans,
  parsePaperAccount,
} from "@kite/sdk";
import type {
  MarketAsset,
  MarketSnapshot,
  PaperAccount,
  MarketBasket,
  PaperPlan,
} from "@kite/sdk";

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
const ACCOUNT_KEY = "kite.paper.mainnet.v1";
const WATCH_KEY = "kite.watchlist.mainnet.v1";
export function KiteProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState(() => createPaperAccount());
  const [hydrated, setHydrated] = useState(false);
  const [accountReadFailed, setAccountReadFailed] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("paper");
  const [toast, setToast] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const mounted = useRef(true);
  const paperRef = useRef(paper);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY);
      if (raw) {
        const saved = parsePaperAccount(JSON.parse(raw));
        if (saved) {
          setPaper(saved);
          paperRef.current = saved;
        } else {
          setAccountReadFailed(true);
          setStorageError(
            "Saved paper account could not be read. Reset it in settings to start again.",
          );
        }
      }
    } catch {
      setAccountReadFailed(true);
      setStorageError(
        "Your saved paper account could not be read. Reset it in settings to start a new local account.",
      );
    }
    try {
      const watched: unknown = JSON.parse(
        localStorage.getItem(WATCH_KEY) ?? "[]",
      );
      if (Array.isArray(watched))
        setWatchlist(watched.filter((v): v is string => typeof v === "string"));
    } catch {
      // Watchlist corruption must not prevent access to a valid paper account.
      setWatchlist([]);
    }
    setHydrated(true);
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/markets", {
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok)
        throw new Error("Market feeds are unavailable. Please try again.");
      const data = (await res.json()) as MarketSnapshot;
      if (!Array.isArray(data.assets) || data.network !== "mainnet-beta")
        throw new Error("Market data could not be verified.");
      if (mounted.current) {
        setSnapshot(data);
        setError(null);
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Unable to load market data.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const persist = useCallback((next: PaperAccount) => {
    paperRef.current = next;
    setPaper(next);
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
    } catch {
      setStorageError("Paper activity could not be saved on this device.");
    }
  }, []);
  const trade = useCallback(
    (asset: MarketAsset, side: "buy" | "sell", amountUsd: number) => {
      if (!hydrated) throw new Error("Your paper account is still loading.");
      if (accountReadFailed)
        throw new Error(
          "Reset the unreadable paper account in settings before trading.",
        );
      const next = executePaperOrder(paperRef.current, asset, side, amountUsd);
      persist(next);
      setToast(`Paper ${side} recorded for ${asset.symbol}.`);
    },
    [hydrated, accountReadFailed, persist],
  );
  const tradeBasket = useCallback(
    (basket: MarketBasket, amountUsd: number) => {
      if (!hydrated) throw new Error("Your paper account is still loading.");
      if (accountReadFailed)
        throw new Error(
          "Reset the unreadable paper account in settings before trading.",
        );
      persist(executePaperBasket(paperRef.current, basket, amountUsd));
      setToast("Paper basket purchase recorded.");
    },
    [hydrated, accountReadFailed, persist],
  );
  const createPlan = useCallback(
    (
      input: Pick<
        PaperPlan,
        "targetId" | "targetType" | "name" | "amountUsd" | "frequency"
      >,
    ) => {
      if (!hydrated || accountReadFailed)
        throw new Error("Your paper account is unavailable. Check settings.");
      persist(createPaperPlan(paperRef.current, input));
      setToast("Recurring paper plan created.");
    },
    [persist, hydrated, accountReadFailed],
  );
  const togglePlan = useCallback(
    (id: string) => {
      if (!hydrated || accountReadFailed) return;
      persist(togglePaperPlan(paperRef.current, id));
    },
    [persist, hydrated, accountReadFailed],
  );
  useEffect(() => {
    if (!hydrated || accountReadFailed || !snapshot) return;
    const next = runDuePaperPlans(paperRef.current, snapshot);
    if (next !== paperRef.current) persist(next);
  }, [snapshot, hydrated, accountReadFailed, persist]);
  const toggleWatch = useCallback(
    (mint: string) => {
      if (!hydrated) return;
      setWatchlist((current) => {
        const next = current.includes(mint)
          ? current.filter((m) => m !== mint)
          : [...current, mint];
        try {
          localStorage.setItem(WATCH_KEY, JSON.stringify(next));
        } catch {
          setStorageError("Watchlist could not be saved on this device.");
        }
        return next;
      });
    },
    [hydrated],
  );
  const portfolio = useMemo(
    () => valuePaperAccount(paper, snapshot?.assets ?? []),
    [paper, snapshot],
  );
  const value: KiteState = {
    snapshot,
    loading,
    error,
    refresh,
    paper,
    portfolio,
    hydrated,
    accountReadFailed,
    mode,
    setMode,
    watchlist,
    toggleWatch,
    trade,
    tradeBasket,
    createPlan,
    togglePlan,
    resetPaper: () => {
      setAccountReadFailed(false);
      setStorageError(null);
      persist(createPaperAccount());
      setToast("Paper account reset.");
    },
    toast,
    notify: setToast,
    clearToast: () => setToast(null),
    storageError,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useKite() {
  const value = useContext(Context);
  if (!value) throw new Error("useKite must be used within KiteProvider");
  return value;
}
