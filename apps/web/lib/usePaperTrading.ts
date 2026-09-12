'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getPaperState,
  executePaperBuy,
  executePaperSell,
  createPaperSip,
  togglePaperSip,
  executeSipCycleNow,
  resetPaperPortfolio,
  PaperPortfolioState,
} from './paper-trading';
import type { QuoteData } from './market-types';

export function usePaperTrading(quotes?: Record<string, QuoteData>) {
  const [state, setState] = useState<PaperPortfolioState>(getPaperState);

  const refresh = useCallback(() => {
    setState(getPaperState());
  }, []);

  useEffect(() => {
    refresh();
    const handleUpdate = () => refresh();
    window.addEventListener('kite_paper_update', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('kite_paper_update', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [refresh]);

  // Compute Total NAV, Invested Value, and Unrealized P&L
  let holdingsValue = 0;
  let totalCost = 0;
  let todayPnLDollar = 0;

  state.holdings.forEach((h) => {
    const rawSym = h.symbol.replace(/^x/, '').replace(/^pre/, '');
    const quote = quotes ? (quotes[rawSym] || quotes[h.symbol]) : undefined;
    const currentPrice = quote?.price || h.avgPrice;
    const itemVal = h.shares * currentPrice;
    const itemCost = h.shares * h.avgPrice;
    holdingsValue += itemVal;
    totalCost += itemCost;

    if (quote?.change) {
      todayPnLDollar += h.shares * quote.change;
    }
  });

  const totalNav = Number((state.cashBalance + holdingsValue).toFixed(2));
  const totalPnLDollar = Number((holdingsValue - totalCost).toFixed(2));
  const totalPnLPct = totalCost > 0 ? Number(((totalPnLDollar / totalCost) * 100).toFixed(2)) : 0;
  const todayPnLPct = totalNav > 0 ? Number(((todayPnLDollar / totalNav) * 100).toFixed(2)) : 0;

  return {
    state,
    cashBalance: state.cashBalance,
    holdings: state.holdings,
    sips: state.sips,
    orders: state.orders,
    totalNav,
    holdingsValue: Number(holdingsValue.toFixed(2)),
    investedValue: Number(totalCost.toFixed(2)),
    totalPnLDollar,
    totalPnLPct,
    todayPnLDollar: Number(todayPnLDollar.toFixed(2)),
    todayPnLPct,
    buy: executePaperBuy,
    sell: executePaperSell,
    createSip: createPaperSip,
    toggleSip: togglePaperSip,
    executeSipCycle: executeSipCycleNow,
    reset: resetPaperPortfolio,
    refresh,
  };
}
