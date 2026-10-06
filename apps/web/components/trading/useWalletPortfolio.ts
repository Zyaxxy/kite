"use client";

import { useCallback, useEffect, useState } from "react";
import {
  parseCachedPortfolio,
  portfolioCacheKey,
  PORTFOLIO_FRESH_MS,
  serializePortfolioCache,
  type MainnetPortfolio,
} from "@kite/sdk";
import { kiteClient } from "../kite/api-client";

const pendingReads = new Map<string, Promise<MainnetPortfolio>>();
function readPortfolio(wallet: string) {
  const existing = pendingReads.get(wallet);
  if (existing) return existing;
  const request = kiteClient.getPortfolio(wallet, AbortSignal.timeout(25_000));
  pendingReads.set(wallet, request);
  void request
    .finally(() => {
      if (pendingReads.get(wallet) === request) pendingReads.delete(wallet);
    })
    .catch(() => undefined);
  return request;
}

/** Persisted observations are opt-in for display; order forms always re-read balances. */
export function useWalletPortfolio(
  walletAddress: string | null,
  allowCachedDisplay = false,
) {
  const [snapshot, setSnapshot] = useState<MainnetPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(0);
  const revalidate = useCallback(() => setRevision((value) => value + 1), []);
  const refresh = useCallback(() => {
    // A user-triggered refresh may follow a confirmed trade. Never reuse a read
    // that started before that trade; the prior effect ignores its response.
    if (walletAddress) pendingReads.delete(walletAddress);
    revalidate();
  }, [walletAddress, revalidate]);
  useEffect(() => {
    let active = true;
    setError(null);
    setNow(Date.now());
    setSnapshot((previous) =>
      previous?.walletAddress === walletAddress ? previous : null,
    );
    if (!walletAddress) {
      setLoading(false);
      setCached(false);
      return;
    }
    if (allowCachedDisplay) {
      try {
        const saved = parseCachedPortfolio(
          sessionStorage.getItem(portfolioCacheKey(walletAddress)),
          walletAddress,
        );
        if (saved) {
          setSnapshot((previous) =>
            previous?.walletAddress === walletAddress &&
            Date.parse(previous.observedAt) >= Date.parse(saved.observedAt)
              ? previous
              : saved,
          );
          setCached(true);
        }
      } catch {
        /* Storage can be disabled; live reads remain available. */
      }
    }
    setLoading(true);
    readPortfolio(walletAddress)
      .then((value) => {
        if (!active || value.walletAddress !== walletAddress) return;
        setSnapshot(value);
        setCached(false);
        setNow(Date.now());
        try {
          const encoded = serializePortfolioCache(value);
          if (encoded)
            sessionStorage.setItem(portfolioCacheKey(walletAddress), encoded);
        } catch {
          /* Quota or privacy settings must not hide a live portfolio. */
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Wallet balances are unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [walletAddress, allowCachedDisplay, revision]);
  useEffect(() => {
    if (!walletAddress) return;
    const tick = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible") revalidate();
    };
    const timer = window.setInterval(tick, PORTFOLIO_FRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [walletAddress, revalidate]);
  const portfolio = snapshot?.walletAddress === walletAddress ? snapshot : null;
  return {
    portfolio,
    error,
    loading,
    refresh,
    cached,
    stale: Boolean(
      portfolio &&
      (cached ||
        error ||
        now - Date.parse(portfolio.observedAt) > PORTFOLIO_FRESH_MS),
    ),
  };
}
