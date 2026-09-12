'use client';

import React, { useState } from 'react';
import { usePaperTrading } from '../../lib/usePaperTrading';
import type { QuoteData } from '../../lib/market-types';
import {
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Calendar,
  Layers,
  History,
  Info,
} from 'lucide-react';

interface KitePortfolioProps {
  onSelectAsset?: (symbol: string, isBasket: boolean) => void;
  quotes?: Record<string, QuoteData>;
}

export function KitePortfolio({ onSelectAsset, quotes }: KitePortfolioProps) {
  const {
    holdings,
    cashBalance,
    totalNav,
    investedValue,
    totalPnLDollar,
    totalPnLPct,
    todayPnLDollar,
    todayPnLPct,
    sips,
    orders,
    sell,
    reset,
  } = usePaperTrading(quotes);

  const [selectedTimeframe, setSelectedTimeframe] = useState('1M');
  const [sellingSymbol, setSellingSymbol] = useState<string | null>(null);
  const [sellSharesInput, setSellSharesInput] = useState<number>(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSellSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellingSymbol) return;
    const raw = sellingSymbol.replace(/^x/, '').replace(/^pre/, '');
    const q = quotes ? (quotes[raw] || quotes[sellingSymbol]) : undefined;
    const price = q?.price || 100;
    const res = sell(sellingSymbol, sellSharesInput, price);
    setFeedback(res.message);
    setSellingSymbol(null);
    setSellSharesInput(0);
    setTimeout(() => setFeedback(null), 4000);
  };

  const monthlySipOutlay = sips
    .filter((s) => s.status === 'active')
    .reduce((acc, s) => {
      const mult = s.frequency === 'daily' ? 30 : s.frequency === 'weekly' ? 4 : s.frequency === 'bi-weekly' ? 2 : 1;
      return acc + s.amountUsdc * mult;
    }, 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Subnav Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-xs text-text-muted font-mono">
          <span className="uppercase font-semibold text-text-muted">Portfolio</span>
          <span>/</span>
          <span className="text-text-primary font-medium">Non-Custodial Command Center</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bull-green-subtle text-bull-green text-[10px] font-semibold border border-bull-green/20">
            <span className="w-1.5 h-1.5 rounded-full bg-bull-green animate-pulse" />
            Solana Live
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => reset()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-card hover:bg-surface-card-elevated border border-border-subtle text-xs font-semibold text-text-secondary hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo ($50k)</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="bg-bull-green-subtle border border-bull-green/40 text-bull-green px-4 py-3 rounded-xl text-xs font-mono">
          {feedback}
        </div>
      )}

      {/* HERO NET ASSET VALUE & PERFORMANCE CARD (Stitch screen c8867e71b2a14d0497ea278cf51c40cf) */}
      <div className="relative bg-surface-card border border-border-subtle rounded-2xl p-6 sm:p-7 overflow-hidden shadow-2xl space-y-6">
        {/* Atmospheric Glow */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-bull-green/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Net Asset Value Numbers */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-text-muted uppercase tracking-wider mb-1">
              <span>Total Net Asset Value (NAV)</span>
              <Info className="w-3.5 h-3.5 text-text-muted hover:text-text-primary cursor-pointer" />
            </div>

            <div className="flex flex-wrap items-baseline gap-4">
              <h2 className="font-display text-4xl lg:text-5xl font-bold tracking-tight text-text-primary tabular-nums">
                ${totalNav.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>

              {/* 1D Return Pill */}
              <div
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg font-mono text-sm font-semibold tabular-nums ${
                  todayPnLDollar >= 0
                    ? 'bg-bull-green-subtle text-bull-green border border-bull-green/30'
                    : 'bg-bear-red-subtle text-bear-red border border-bear-red/30'
                }`}
              >
                {todayPnLDollar >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>
                  {todayPnLDollar >= 0 ? '+' : ''}${Math.abs(todayPnLDollar).toFixed(2)} ({todayPnLPct.toFixed(2)}%)
                </span>
                <span className="text-xs text-text-muted font-normal ml-1">Today</span>
              </div>

              {/* All-Time Profit Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-card-elevated border border-border-subtle text-xs font-mono text-text-secondary">
                <span className="text-text-muted">All-Time P&L:</span>
                <span className={`font-semibold tabular-nums ${totalPnLDollar >= 0 ? 'text-bull-green' : 'text-bear-red'}`}>
                  {totalPnLDollar >= 0 ? '+' : ''}${totalPnLDollar.toFixed(2)} ({totalPnLPct.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Secondary Metric Counters (Stitch High-Precision Spec) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-max">
            <div className="bg-surface-base/80 border border-border-subtle/60 rounded-xl p-3">
              <span className="text-[10px] font-mono text-text-muted uppercase">Invested Value</span>
              <p className="font-mono text-base font-bold text-text-primary mt-0.5 tabular-nums">
                ${investedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-text-muted">Book Cost</span>
            </div>

            <div className="bg-surface-base/80 border border-border-subtle/60 rounded-xl p-3">
              <span className="text-[10px] font-mono text-text-muted uppercase">Portfolio XIRR</span>
              <p className="font-mono text-base font-bold text-bull-green mt-0.5 tabular-nums">
                28.6%
              </p>
              <span className="text-[10px] text-text-muted">Annualized</span>
            </div>

            <div className="bg-surface-base/80 border border-border-subtle/60 rounded-xl p-3">
              <span className="text-[10px] font-mono text-text-muted uppercase">Buying Power</span>
              <p className="font-mono text-base font-bold text-text-primary mt-0.5 tabular-nums">
                ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-bull-green font-medium">USDC Ready</span>
            </div>

            <div className="bg-surface-base/80 border border-border-subtle/60 rounded-xl p-3">
              <span className="text-[10px] font-mono text-text-muted uppercase">Monthly SIP Outlay</span>
              <p className="font-mono text-base font-bold text-accent-cyan mt-0.5 tabular-nums">
                ${monthlySipOutlay.toFixed(2)}
              </p>
              <span className="text-[10px] text-text-muted">{sips.length} Active Plans</span>
            </div>
          </div>
        </div>

        {/* Chart Controls & Timeframe Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-subtle/60">
          <div className="flex items-center gap-1 bg-surface-base border border-border-subtle rounded-lg p-1 text-xs font-mono">
            {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  selectedTimeframe === tf
                    ? 'bg-surface-overlay text-bull-green font-bold shadow-sm'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-5 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-bull-green" />
              <span className="text-text-primary font-medium">My Portfolio (+24.4%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-cyan" />
              <span className="text-text-muted">S&P 500 (+14.2%)</span>
            </div>
          </div>
        </div>

        {/* SVG Performance Curve Chart */}
        <div className="relative w-full h-56 lg:h-64 bg-surface-base/80 rounded-xl border border-border-subtle/40 p-4 flex flex-col justify-end overflow-hidden">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120">
            <defs>
              <linearGradient id="navFill" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#00D09C" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#00D09C" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Benchmark S&P Line */}
            <polyline
              fill="none"
              stroke="#38BDF8"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              points="0,105 70,100 140,95 210,98 280,88 350,84 420,78 500,70"
            />
            {/* Portfolio Curve Area Fill */}
            <polygon
              fill="url(#navFill)"
              points="0,110 0,95 70,88 140,90 210,75 280,68 350,50 420,35 500,15 500,120 0,120"
            />
            {/* Portfolio Curve Line */}
            <polyline
              fill="none"
              stroke="#00D09C"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points="0,95 70,88 140,90 210,75 280,68 350,50 420,35 500,15"
            />
          </svg>
        </div>
      </div>

      {/* POSITIONS & HOLDINGS TABLE */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden shadow-md">
        <div className="p-4 border-b border-border-subtle/60 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-sm text-text-primary">Current Asset Holdings</h3>
            <span className="text-[11px] text-text-muted">
              {holdings.length} tokenized positions held non-custodially
            </span>
          </div>
          <span className="text-xs font-mono text-text-secondary">
            Available Cash: <span className="text-text-primary font-bold">${cashBalance.toFixed(2)} USDC</span>
          </span>
        </div>

        {holdings.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-xs text-text-muted">No active positions in your paper portfolio yet.</p>
            <button
              onClick={() => reset()}
              className="px-4 py-2 rounded-lg bg-bull-green text-surface-base font-bold text-xs font-display"
            >
              Load $50,000 Demo Portfolio
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] font-mono uppercase tracking-wider text-text-muted bg-surface-base/40">
                  <th className="py-3 px-4 font-semibold">Asset</th>
                  <th className="py-3 px-4 font-semibold text-right">Quantity</th>
                  <th className="py-3 px-4 font-semibold text-right">Avg Cost</th>
                  <th className="py-3 px-4 font-semibold text-right">Current Price</th>
                  <th className="py-3 px-4 font-semibold text-right">Market Value</th>
                  <th className="py-3 px-4 font-semibold text-right">Unrealized P&L</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/40">
                {holdings.map((h) => {
                  const raw = h.symbol.replace(/^x/, '').replace(/^pre/, '');
                  const q = quotes ? (quotes[raw] || quotes[h.symbol]) : undefined;
                  const currentPrice = q?.price || h.avgPrice;
                  const marketVal = h.shares * currentPrice;
                  const pnlDollar = marketVal - h.shares * h.avgPrice;
                  const pnlPct = h.avgPrice > 0 ? (pnlDollar / (h.shares * h.avgPrice)) * 100 : 0;

                  return (
                    <tr key={h.symbol} className="hover:bg-surface-card-elevated transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-surface-overlay flex items-center justify-center font-bold text-bull-green font-mono text-[11px]">
                            {raw.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-bold text-text-primary">{h.name}</div>
                            <span className="text-[11px] font-mono text-bull-green">{h.symbol}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-text-primary tabular-nums">
                        {h.shares}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-text-muted tabular-nums">
                        ${h.avgPrice.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-text-primary tabular-nums">
                        ${currentPrice.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-text-primary tabular-nums">
                        ${marketVal.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-mono text-[11px] font-bold tabular-nums ${
                            pnlDollar >= 0
                              ? 'bg-bull-green-subtle text-bull-green'
                              : 'bg-bear-red-subtle text-bear-red'
                          }`}
                        >
                          {pnlDollar >= 0 ? '+' : ''}${pnlDollar.toFixed(2)} ({pnlPct.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              if (onSelectAsset) onSelectAsset(h.symbol, h.isBasket);
                            }}
                            className="px-2.5 py-1 rounded bg-surface-overlay hover:bg-bull-green hover:text-surface-base font-semibold text-[11px] transition-colors"
                          >
                            Buy
                          </button>
                          <button
                            onClick={() => {
                              setSellingSymbol(h.symbol);
                              setSellSharesInput(h.shares);
                            }}
                            className="px-2.5 py-1 rounded bg-surface-overlay hover:bg-bear-red hover:text-white font-semibold text-[11px] transition-colors text-bear-red"
                          >
                            Sell
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sell Modal Sheet */}
      {sellingSymbol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-card border border-border-interactive rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="font-display font-bold text-base text-text-primary">
              Sell Position: {sellingSymbol}
            </h3>
            <form onSubmit={handleSellSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-text-muted mb-1">
                  Quantity to Sell (Shares)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={sellSharesInput}
                  onChange={(e) => setSellSharesInput(Number(e.target.value))}
                  className="w-full bg-surface-base border border-border-subtle rounded-lg px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-bull-green"
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSellingSymbol(null)}
                  className="flex-1 py-2 rounded-lg bg-surface-overlay text-xs font-semibold text-text-secondary hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-bear-red hover:brightness-110 text-xs font-bold text-white shadow-[0_0_12px_rgba(255,82,82,0.3)]"
                >
                  Confirm Sell
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECENT ORDERS LEDGER */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-sm text-text-primary flex items-center gap-2">
            <History className="w-4 h-4 text-bull-green" />
            <span>Execution Ledger (Simulated Non-Custodial Fills)</span>
          </h3>
          <span className="text-xs font-mono text-text-muted">{orders.length} Total Orders</span>
        </div>

        <div className="divide-y divide-border-subtle/40 text-xs font-mono">
          {orders.slice(0, 5).map((ord) => (
            <div key={ord.id} className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    ord.type === 'BUY'
                      ? 'bg-bull-green-subtle text-bull-green'
                      : ord.type === 'SELL'
                      ? 'bg-bear-red-subtle text-bear-red'
                      : 'bg-accent-cyan/15 text-accent-cyan'
                  }`}
                >
                  {ord.type}
                </span>
                <span className="font-bold text-text-primary">{ord.symbol}</span>
                <span className="text-text-muted text-[11px] hidden sm:inline">
                  {ord.shares} units @ ${ord.price.toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-text-primary tabular-nums">
                  ${ord.amountUsdc.toFixed(2)} USDC
                </span>
                <span className="text-[10px] text-text-muted block">
                  Tx: {ord.txHash} • Filled
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
