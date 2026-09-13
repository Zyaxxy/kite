"use client";

import { useCallback, useEffect, useState } from "react";
import type { MainnetPortfolio } from "@kite/sdk";
import { kiteClient } from "../kite/api-client";

/** Keep account changes isolated: a prior wallet's balance is never used for Max. */
export function useWalletPortfolio(walletAddress: string | null) {
  const [snapshot, setSnapshot] = useState<MainnetPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    setError(null);
    if (!walletAddress) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    kiteClient
      .getPortfolio(walletAddress, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && value.walletAddress === walletAddress)
          setSnapshot(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Wallet balances are unavailable.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [walletAddress, revision]);
  useEffect(() => {
    if (!walletAddress) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [walletAddress, refresh]);
  return {
    portfolio: snapshot?.walletAddress === walletAddress ? snapshot : null,
    error,
    loading,
    refresh,
  };
}
