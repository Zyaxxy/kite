import type { KiteClient } from "../client/kite-client";
import type { MarketSnapshot } from "../markets";
import {
  createPaperAccount,
  parsePaperAccount,
  runDuePaperPlans,
  type PaperAccount,
} from "../paper";

export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}
export interface KiteCoreState {
  market: MarketSnapshot | null;
  account: PaperAccount;
  watchlist: string[];
  hydrated: boolean;
  accountReadFailed: boolean;
  loading: boolean;
  error: string | null;
  storageError: string | null;
}
export interface KiteCoreOptions {
  storage: StorageAdapter;
  client: Pick<KiteClient, "getMarkets">;
  accountKey: string;
  watchlistKey: string;
  marketKey?: string;
  now?: () => number;
}

/** Platform-independent lifecycle, conditional polling and serial persistence. No wallet keys are stored here. */
export function createKiteCore(options: KiteCoreOptions) {
  const now = options.now ?? Date.now;
  let state: KiteCoreState = {
    market: null,
    account: createPaperAccount(),
    watchlist: [],
    hydrated: false,
    accountReadFailed: false,
    loading: true,
    error: null,
    storageError: null,
  };
  const listeners = new Set<() => void>();
  let hydration: Promise<void> | null = null;
  let writes = Promise.resolve();
  let etag: string | null = null;
  let lastFetchedAt: number | null = null;
  let running = false;
  let active = true;
  let suspended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flight: { controller: AbortController; promise: Promise<void> } | null =
    null;
  const publish = (change: Partial<KiteCoreState>) => {
    state = { ...state, ...change };
    listeners.forEach((listener) => listener());
  };
  const persist = (key: string, value: unknown) => {
    const encoded = JSON.stringify(value);
    writes = writes
      .then(() => options.storage.setItem(key, encoded))
      .catch(() =>
        publish({
          storageError:
            "Changes could not be saved on this device. Keep the app open and check available storage.",
        }),
      );
  };
  const updateAccount = (update: (account: PaperAccount) => PaperAccount) => {
    if (!state.hydrated)
      throw new Error("Your paper account is still loading.");
    if (state.accountReadFailed)
      throw new Error(
        "Reset the unreadable paper account in settings before trading.",
      );
    const account = update(state.account);
    if (account === state.account) return;
    if (!parsePaperAccount(account))
      throw new Error("The paper account update is invalid.");
    persist(options.accountKey, account);
    publish({ account });
  };
  const runPlans = () => {
    if (
      active &&
      !suspended &&
      state.hydrated &&
      !state.accountReadFailed &&
      state.market &&
      !state.market.refreshing
    )
      updateAccount((account) =>
        runDuePaperPlans(account, state.market!, new Date(now()).toISOString()),
      );
  };
  const hydrate = (): Promise<void> => {
    if (hydration) return hydration;
    hydration = (async () => {
      const [saved, watched, savedMarket] = await Promise.allSettled([
        Promise.resolve().then(() =>
          options.storage.getItem(options.accountKey),
        ),
        Promise.resolve().then(() =>
          options.storage.getItem(options.watchlistKey),
        ),
        options.marketKey
          ? Promise.resolve().then(() =>
              options.storage.getItem(options.marketKey!),
            )
          : Promise.resolve(null),
      ]);
      let account = state.account;
      let failed = false;
      try {
        if (saved.status === "rejected") throw saved.reason;
        if (saved.value !== null) {
          const parsed = parsePaperAccount(JSON.parse(saved.value));
          if (!parsed) throw new Error("Unreadable account");
          account = parsed;
        }
      } catch {
        failed = true;
      }
      let watchlist: string[] = [];
      let watchFailed = false;
      try {
        if (watched.status === "rejected") throw watched.reason;
        const parsed: unknown = JSON.parse(watched.value ?? "[]");
        if (
          !Array.isArray(parsed) ||
          !parsed.every((mint) => typeof mint === "string")
        )
          throw new Error("Unreadable watchlist");
        watchlist = [...new Set(parsed as string[])];
      } catch {
        watchFailed = true;
      }
      let market = state.market;
      try {
        if (savedMarket.status === "fulfilled" && savedMarket.value) {
          const parsed = JSON.parse(savedMarket.value);
          if (
            parsed &&
            typeof parsed === "object" &&
            parsed.snapshot &&
            parsed.snapshot.network === "mainnet-beta" &&
            Array.isArray(parsed.snapshot.assets)
          ) {
            market = parsed.snapshot;
            if (typeof parsed.etag === "string") etag = parsed.etag;
            if (typeof parsed.cachedAt === "number")
              lastFetchedAt = parsed.cachedAt;
          }
        }
      } catch {
        // Unreadable market cache is ignored gracefully.
      }
      publish({
        account,
        watchlist,
        market,
        loading: market === null,
        hydrated: true,
        accountReadFailed: failed,
        storageError: failed
          ? "Your saved paper account could not be opened. Reset it in settings to start again."
          : watchFailed
            ? "Your saved watchlist could not be read. Save assets again to rebuild it."
            : null,
      });
      runPlans();
    })();
    return hydration;
  };
  const schedule = () => {
    clearTimeout(timer);
    if (running && active)
      timer = setTimeout(
        () => {
          void refresh(false);
        },
        state.market?.refreshing ? 2_000 : 60_000,
      );
  };
  const refresh = (force = true): Promise<void> => {
    if (flight && !flight.controller.signal.aborted) return flight.promise;
    if (
      !force &&
      !state.market?.refreshing &&
      lastFetchedAt !== null &&
      now() - lastFetchedAt < 30_000
    ) {
      schedule();
      return Promise.resolve();
    }
    const controller = new AbortController();
    if (!state.market) publish({ loading: true });
    const operation = { controller, promise: Promise.resolve() };
    flight = operation;
    operation.promise = (async () => {
      try {
        const result = await options.client.getMarkets({
          etag: state.market ? etag : null,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (result.notModified && !state.market)
          throw new Error("Market data is missing. Please retry.");
        etag = result.etag;
        lastFetchedAt = now();
        if (result.notModified) {
          publish({ error: null });
          if (options.marketKey && state.market) {
            persist(options.marketKey, {
              snapshot: state.market,
              etag: result.etag ?? etag,
              cachedAt: now(),
            });
          }
        } else {
          publish({ market: result.data, error: null });
          if (options.marketKey && result.data && result.data.status !== "unavailable") {
            persist(options.marketKey, {
              snapshot: result.data,
              etag: result.etag,
              cachedAt: now(),
            });
          }
        }
        runPlans();
      } catch (error) {
        if (!controller.signal.aborted)
          publish({
            error:
              error instanceof Error
                ? error.message
                : "Unable to load live markets.",
          });
      } finally {
        if (flight === operation) {
          flight = null;
          publish({ loading: false });
          schedule();
        }
      }
    })();
    return operation.promise;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hydrate,
    refresh,
    updateAccount,
    toggleWatch: (mint: string) => {
      if (!state.hydrated) return;
      const watchlist = state.watchlist.includes(mint)
        ? state.watchlist.filter((item) => item !== mint)
        : [...state.watchlist, mint];
      persist(options.watchlistKey, watchlist);
      publish({ watchlist });
    },
    resetAccount: () => {
      if (!state.hydrated)
        throw new Error("Your saved account is still loading.");
      const account = createPaperAccount();
      persist(options.accountKey, account);
      publish({ account, accountReadFailed: false, storageError: null });
    },
    start: () => {
      running = true;
      suspended = false;
      void hydrate();
      if (active) void refresh(false);
    },
    setActive: (value: boolean) => {
      active = value;
      clearTimeout(timer);
      if (running && active) void refresh(false);
    },
    stop: () => {
      running = false;
      suspended = true;
      clearTimeout(timer);
      flight?.controller.abort();
    },
    flush: () => writes,
  };
}
