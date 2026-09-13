"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TradingMode = "paper" | "actual";
const STORAGE_KEY = "kite.trading.mode.v1";

export function useTradingMode() {
  const [mode, updateMode] = useState<TradingMode>("paper");
  const chosen = useRef(false);

  useEffect(() => {
    // A deliberate selection (including a stock deep link) wins over hydration.
    if (chosen.current) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "paper" || saved === "actual") updateMode(saved);
    } catch {
      // Storage can be disabled; the current session remains usable.
    }
  }, []);

  const setMode = useCallback((next: TradingMode) => {
    chosen.current = true;
    updateMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is optional and never blocks a mode change.
    }
  }, []);

  return [mode, setMode] as const;
}
