'use client';

import React, { useState } from 'react';
import { CURATED_BASKETS, ThematicBasket } from '@kite/sdk';
import type { QuoteData } from '../../lib/market-types';
import {
  ShieldCheck,
  TrendingUp,
  Cpu,
  Layers,
  ArrowLeft,
  Share2,
  Bookmark,
  Zap,
  CheckCircle2,
  Lock,
  LineChart,
} from 'lucide-react';

interface KiteBasketsProps {
  onSelectBasket: (basketId: string) => void;
  selectedBasketId?: string | null;
  onBack?: () => void;
  quotes?: Record<string, QuoteData>;
}

export function KiteBaskets({
  onSelectBasket,
  selectedBasketId,
  onBack,
  quotes,
}: KiteBasketsProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1Y');

  // If a specific basket is selected, render the deep-dive view from Stitch screen 69900acb2b974655aaa971ab8e0bbbc6
  if (selectedBasketId) {
    const basket =
      CURATED_BASKETS.find((b) => b.id === selectedBasketId || b.ticker === selectedBasketId) ||
      CURATED_BASKETS[0];

    const isTitan = basket.id === 'sol-ai-infra';
    const navPrice = isTitan ? 114.20 : basket.id === 'sol-mag7' ? 248.50 : 185.00;
    const return1Y = isTitan ? '+48.60%' : basket.id === 'sol-mag7' ? '+49.20%' : '+28.40%';
    const tvl = isTitan ? '$68.42M' : basket.id === 'sol-mag7' ? '$124.80M' : '$32.10M';

    return (
      <div className="space-y-6">
        {/* Top Breadcrumb & Status Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-text-muted">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1 text-text-secondary hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Baskets</span>
              </button>
            )}
            <span>/</span>
            <span className="text-text-primary font-semibold">{basket.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-card border border-border-subtle text-text-secondary text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-bull-green animate-pulse" />
              Pyth Oracle Verified
            </div>
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-card border border-border-subtle text-bull-green text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              100% Non-Custodial
            </div>
          </div>
        </div>

        {/* Basket Header & Key Metrics Strip */}
        <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 shadow-xl space-y-6 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-surface-card-elevated border border-border-interactive flex items-center justify-center text-bull-green shadow-inner">
                {isTitan ? <Cpu className="w-7 h-7" /> : <Layers className="w-7 h-7" />}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-bold text-text-primary">{basket.name}</h1>
                  <span className="px-2 py-0.5 rounded bg-surface-overlay text-bull-green font-mono text-xs font-semibold">
                    {basket.ticker}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-card-elevated text-text-muted font-mono text-[10px] uppercase">
                    SPL-Token
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1 max-w-xl leading-relaxed">
                  {basket.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-card-elevated hover:bg-surface-overlay border border-border-subtle text-xs font-medium text-text-secondary hover:text-white transition-colors">
                <Bookmark className="w-3.5 h-3.5" />
                <span>Watch</span>
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-card-elevated hover:bg-surface-overlay border border-border-subtle text-xs font-medium text-text-secondary hover:text-white transition-colors">
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            </div>
          </div>

          {/* Metric Cards Bento Strip (Stitch High-Precision Spec) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-5 border-t border-border-subtle/60 bg-surface-base/50 rounded-xl p-4">
            <div>
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">Current NAV / Unit</span>
              <span className="font-mono text-xl font-bold text-text-primary mt-1 block tabular-nums">${navPrice.toFixed(2)}</span>
              <span className="text-[11px] font-mono text-bull-green flex items-center gap-1 mt-0.5">
                <TrendingUp className="w-3 h-3" /> +3.08% 24H
              </span>
            </div>

            <div>
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">1Y Cumulative</span>
              <span className="font-mono text-xl font-bold text-bull-green mt-1 block tabular-nums">{return1Y}</span>
              <span className="text-[11px] font-mono text-text-muted mt-0.5 block">Outperforming S&P</span>
            </div>

            <div>
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">Total TVL Minted</span>
              <span className="font-mono text-xl font-bold text-text-primary mt-1 block tabular-nums">{tvl}</span>
              <span className="text-[11px] font-mono text-text-muted mt-0.5 block">Fully backed</span>
            </div>

            <div>
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">Rebalance Cadence</span>
              <span className="font-mono text-base font-bold text-text-primary mt-1 block">Weekly Quant</span>
              <span className="text-[11px] font-mono text-text-muted mt-0.5 block">Programmatic swap</span>
            </div>

            <div className="col-span-2 md:col-span-1">
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">Sharpe Profile</span>
              <span className="font-mono text-base font-bold text-bull-green mt-1 block tabular-nums">2.41 Sharpe</span>
              <span className="text-[11px] font-mono text-text-muted mt-0.5 block">Beta: 1.15</span>
            </div>
          </div>
        </div>

        {/* SECTION A: Interactive Performance Chart */}
        <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="font-display font-bold text-base text-text-primary">NAV Performance Trajectory</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bull-green-subtle text-bull-green font-mono text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-bull-green" />
                Live Feed
              </span>
            </div>

            {/* Timeframe selector */}
            <div className="flex items-center gap-1 bg-surface-base p-1 rounded-lg text-xs font-mono">
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
          </div>

          {/* Benchmark Legend */}
          <div className="flex items-center gap-5 text-xs font-mono pt-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-bull-green" />
              <span className="text-text-primary font-medium">{basket.ticker} (+48.6%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-cyan" />
              <span className="text-text-muted">S&P 500 Index (+14.2%)</span>
            </div>
          </div>

          {/* Performance Chart SVG */}
          <div className="relative w-full h-64 bg-surface-base/80 rounded-xl p-4 overflow-hidden flex flex-col justify-end border border-border-subtle/40">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150">
              <defs>
                <linearGradient id="basketGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00D09C" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#00D09C" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Benchmark S&P 500 Line (Cyan) */}
              <polyline
                fill="none"
                stroke="#38BDF8"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                points="0,135 60,130 120,122 180,125 240,115 300,110 360,105 420,100 500,92"
              />
              {/* Basket NAV Fill Area */}
              <polygon
                fill="url(#basketGrad)"
                points="0,140 0,130 60,120 120,105 180,110 240,90 300,80 360,65 420,45 500,20 500,150 0,150"
              />
              {/* Basket NAV Line (Bull Green) */}
              <polyline
                fill="none"
                stroke="#00D09C"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points="0,130 60,120 120,105 180,110 240,90 300,80 360,65 420,45 500,20"
              />
            </svg>
          </div>
        </div>

        {/* SECTION B: Underlying Token Composition Table */}
        <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden shadow-md">
          <div className="p-4 border-b border-border-subtle/60 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-sm text-text-primary">Underlying Token Composition</h3>
              <span className="text-[11px] text-text-muted">Real-time weights condition programmatic rebalancing</span>
            </div>
            <span className="text-xs font-mono text-bull-green font-semibold">100.0% Allocated</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] font-mono uppercase tracking-wider text-text-muted bg-surface-base/40">
                  <th className="py-3 px-4 font-semibold">Asset</th>
                  <th className="py-3 px-4 font-semibold text-right">Target Weight</th>
                  <th className="py-3 px-4 font-semibold text-right">Live Price</th>
                  <th className="py-3 px-4 font-semibold text-right">24H Change</th>
                  <th className="py-3 px-4 font-semibold text-right">1Y Return</th>
                  <th className="py-3 px-4 font-semibold text-right">Rebalance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/40">
                {basket.assets.map((asset) => {
                  const rawSym = asset.symbol.replace(/^x/, '').replace(/^pre/, '');
                  const q = quotes ? (quotes[rawSym] || quotes[asset.symbol]) : undefined;
                  const price = q?.price ?? 120.0;
                  const changePct = q?.changePct ?? 1.8;
                  const weightPct = (asset.weight / 100).toFixed(1);

                  return (
                    <tr key={asset.symbol} className="hover:bg-surface-card-elevated transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-surface-overlay flex items-center justify-center font-bold text-bull-green font-mono text-[11px]">
                            {rawSym.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-bold text-text-primary">{asset.name}</div>
                            <span className="text-[11px] font-mono text-bull-green">{asset.symbol}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-text-primary tabular-nums">
                        {weightPct}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-text-primary tabular-nums">
                        ${price.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold tabular-nums ${
                            changePct >= 0
                              ? 'bg-bull-green-subtle text-bull-green'
                              : 'bg-bear-red-subtle text-bear-red'
                          }`}
                        >
                          {changePct >= 0 ? '+' : ''}
                          {changePct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-bull-green font-medium tabular-nums">
                        +42.8%
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-text-secondary">
                          <span className="w-1.5 h-1.5 rounded-full bg-bull-green" />
                          Balanced
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION C: Strategy Thesis Bento Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-sm space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-surface-overlay flex items-center justify-center text-bull-green">
              <Zap className="w-4 h-4" />
            </div>
            <h4 className="font-display font-bold text-sm text-text-primary">Quantitative Rebalancing Thesis</h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              Conditioned weekly on foundry fab yields, hyperscaler capital expenditure reports, and order book depth signals. Max allocation capped at 35% to prevent single-stock concentration risk.
            </p>
          </div>

          <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-sm space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-surface-overlay flex items-center justify-center text-accent-cyan">
              <Lock className="w-4 h-4" />
            </div>
            <h4 className="font-display font-bold text-sm text-text-primary">1:1 Non-Custodial Guarantee</h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              Minted tokenized shares are held directly in your wallet. Redeemable instantly into native USDC through Jupiter DEX liquidity pools without lockups or middleman delays.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // GALLERY VIEW: Display all curated thematic baskets
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">
          Thematic Stock Baskets
        </h1>
        <p className="text-xs text-text-muted mt-1 max-w-2xl leading-relaxed">
          1-click diversified non-custodial index baskets on Solana. Powered by atomic Jupiter routing and Pyth 24/7 oracles.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {CURATED_BASKETS.map((basket) => {
          const isTitan = basket.id === 'sol-ai-infra';
          const navPrice = isTitan ? 114.20 : basket.id === 'sol-mag7' ? 248.50 : 185.00;
          const return1Y = isTitan ? '+48.60%' : basket.id === 'sol-mag7' ? '+49.20%' : '+28.40%';

          return (
            <div
              key={basket.id}
              onClick={() => onSelectBasket(basket.id)}
              className="bg-surface-card hover:bg-surface-card-elevated border border-border-subtle hover:border-bull-green/40 rounded-2xl p-6 cursor-pointer transition-all shadow-md hover:shadow-xl flex flex-col justify-between group space-y-5"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-surface-overlay border border-border-interactive flex items-center justify-center text-bull-green group-hover:scale-105 transition-transform">
                      {isTitan ? <Cpu className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold text-text-primary group-hover:text-bull-green transition-colors">
                        {basket.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-surface-overlay text-bull-green border border-bull-green/20">
                        {basket.ticker}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold text-bull-green tabular-nums">
                    {return1Y}
                  </span>
                </div>

                <p className="text-xs text-text-secondary mt-3 leading-relaxed">
                  {basket.description}
                </p>

                {/* Underlying Assets Badges */}
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {basket.assets.map((a) => (
                    <span
                      key={a.symbol}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-base text-text-secondary border border-border-subtle"
                    >
                      {a.symbol} ({((a.weight / 10000) * 100).toFixed(0)}%)
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-border-subtle/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-text-muted uppercase block">NAV Per Unit</span>
                  <span className="font-mono text-base font-bold text-text-primary tabular-nums">
                    ${navPrice.toFixed(2)}
                  </span>
                </div>
                <button className="px-4 py-2 rounded-lg bg-bull-green hover:brightness-110 active:scale-95 text-surface-base font-bold text-xs font-display flex items-center gap-1.5 transition-all shadow-[0_0_16px_rgba(0,208,156,0.3)]">
                  <span>Explore Basket</span>
                  <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
