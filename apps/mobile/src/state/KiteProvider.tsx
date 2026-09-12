import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createPaperAccount, parsePaperAccount, runDuePaperPlans, type MarketSnapshot, type PaperAccount } from '@kite/sdk';
import { apiGetConditional } from '../lib/config';

const STORAGE_KEY = 'kite.mobile.paper.v1';
const WATCHLIST_KEY = 'kite.mobile.watchlist.v1';

type KiteContextValue = {
  market: MarketSnapshot | null; account: PaperAccount; watchlist: string[];
  loading: boolean; ready: boolean; error: string | null; storageError: string | null;
  refresh: () => Promise<void>; updateAccount: (update: (account: PaperAccount) => PaperAccount) => void;
  toggleWatch: (mint: string) => void; resetAccount: () => void;
};
const KiteContext = createContext<KiteContextValue | null>(null);

export function KiteProvider({ children }: { children: ReactNode }) {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [account, setAccount] = useState(() => createPaperAccount());
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const accountRef = useRef(account);
  const watchlistRef = useRef(watchlist);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const requestRef = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);
  const lastRefreshAt = useRef(0);
  const marketRef = useRef(market);
  const marketEtag = useRef<string | null>(null);

  const persist = useCallback((key: string, value: unknown) => {
    writeQueue.current = writeQueue.current.then(() => AsyncStorage.setItem(key, JSON.stringify(value))).catch(() => {
      setStorageError('Changes could not be saved to this device. Keep the app open and check available storage.');
    });
  }, []);

  const updateAccount = useCallback((update: (current: PaperAccount) => PaperAccount) => {
    if (!ready) throw new Error('Your paper account is still loading.');
    const next = update(accountRef.current);
    if (next === accountRef.current) return;
    accountRef.current = next;
    setAccount(next);
    persist(STORAGE_KEY, next);
  }, [ready, persist]);

  const fetchMarket = useCallback((force = false): Promise<void> => {
    if (requestRef.current && !requestRef.current.controller.signal.aborted) return requestRef.current.promise;
    if (!force && !marketRef.current?.refreshing && Date.now() - lastRefreshAt.current < 30_000) return Promise.resolve();
    const controller = new AbortController();
    const showLoading = force || !marketRef.current;
    if (showLoading) setLoading(true);
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
    const promise = apiGetConditional<MarketSnapshot>('/api/markets', controller.signal, marketRef.current ? marketEtag.current : null)
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.notModified) {
          marketEtag.current = result.etag;
          lastRefreshAt.current = Date.now();
          setError(null);
          return;
        }
        const response = result.data;
        if (response.network !== 'mainnet-beta' || !Array.isArray(response.assets) || !Array.isArray(response.baskets)) throw new Error('The market service returned an invalid mainnet response.');
        marketEtag.current = result.etag;
        lastRefreshAt.current = Date.now();
        marketRef.current = response;
        setMarket(response); setError(null);
      })
      .catch((failure: unknown) => {
        if (timedOut) setError('The live market connection timed out. Pull down to retry.');
        else if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to reach live markets.');
      })
      .finally(() => {
        clearTimeout(timeout);
        if (requestRef.current?.controller === controller) {
          requestRef.current = null;
          if (showLoading && (!controller.signal.aborted || timedOut)) setLoading(false);
        }
      });
    requestRef.current = { controller, promise };
    return promise;
  }, []);
  const refresh = useCallback(() => fetchMarket(true), [fetchMarket]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(WATCHLIST_KEY)]).then(([saved, watched]) => {
      if (cancelled) return;
      const restored = saved ? parsePaperAccount(JSON.parse(saved) as unknown) : createPaperAccount();
      if (!restored) throw new Error('Saved account is invalid.');
      accountRef.current = restored; setAccount(restored);
      if (watched) {
        try {
          const data: unknown = JSON.parse(watched);
          if (Array.isArray(data) && data.every(mint => typeof mint === 'string')) { watchlistRef.current = data; setWatchlist(data); }
        } catch { setStorageError('Your saved watchlist could not be read. Save assets again to rebuild it.'); }
      }
      setReady(true);
    }).catch(() => { if (!cancelled) setStorageError('Your saved account could not be opened. Trading is paused. Reset the paper account in settings to start again.'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void fetchMarket();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void fetchMarket(); });
    return () => { listener.remove(); requestRef.current?.controller.abort(); };
  }, [fetchMarket]);

  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') void fetchMarket(); }, market?.refreshing ? 2_000 : 60_000);
    return () => clearInterval(timer);
  }, [fetchMarket, market?.refreshing]);

  useEffect(() => {
    if (!market || !ready || market.refreshing) return;
    updateAccount(current => runDuePaperPlans(current, market));
  }, [market, ready, updateAccount]);

  const toggleWatch = useCallback((mint: string) => {
    if (!ready) return;
    const current = watchlistRef.current;
    const next = current.includes(mint) ? current.filter(item => item !== mint) : [...current, mint];
    watchlistRef.current = next; setWatchlist(next); persist(WATCHLIST_KEY, next);
  }, [ready, persist]);

  const resetAccount = useCallback(() => {
    const next = createPaperAccount();
    accountRef.current = next; setAccount(next); setReady(true); setStorageError(null); persist(STORAGE_KEY, next);
  }, [persist]);

  return <KiteContext.Provider value={{ market, account, watchlist, loading, ready, error, storageError, refresh, updateAccount, toggleWatch, resetAccount }}>{children}</KiteContext.Provider>;
}

export function useKite() {
  const context = useContext(KiteContext);
  if (!context) throw new Error('useKite must be used within KiteProvider.');
  return context;
}
