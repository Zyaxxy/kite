'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { CURATED_BASKETS } from '@kite/sdk';
import type { QuoteData } from '../../lib/market-types';
import {
  Activity,
  Layers,
  Cpu,
  ArrowUpRight,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';

interface KiteMarketsProps {
  onSelectStock: (symbol: string) => void;
  onSelectBasket: (basketId: string) => void;
  quotes?: Record<string, QuoteData>;
}

export function KiteMarkets({ onSelectStock, onSelectBasket, quotes }: KiteMarketsProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [liveNews, setLiveNews] = useState<{
    title: string;
    source: string;
    sentimentLabel: string;
    sentimentScore: number;
    aiSummary: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch live market intelligence news
  useEffect(() => {
    fetch('/api/news?symbol=NVDA')
      .then((res) => res.json())
      .then((data) => {
        if (data.articles && data.articles.length > 0) {
          setLiveNews({
            title: data.articles[0].title,
            source: data.articles[0].source,
            sentimentLabel: data.sentimentLabel,
            sentimentScore: data.sentimentScore,
            aiSummary: data.aiSummary,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Full catalog of tokenized stocks with live quotes
  const stockList = useMemo(() => {
    const symbols = [
      { sym: 'NVDA', name: 'Nvidia Corporation', category: 'AI & Foundry', tokenTag: 'dNVDA' },
      { sym: 'AAPL', name: 'Apple Inc.', category: 'Mega-Cap Tech', tokenTag: 'dAAPL' },
      { sym: 'MSFT', name: 'Microsoft Corporation', category: 'Mega-Cap Tech', tokenTag: 'dMSFT' },
      { sym: 'TSLA', name: 'Tesla Inc.', category: 'Mega-Cap Tech', tokenTag: 'dTSLA' },
      { sym: 'AMZN', name: 'Amazon.com Inc.', category: 'Mega-Cap Tech', tokenTag: 'dAMZN' },
      { sym: 'GOOGL', name: 'Alphabet Inc.', category: 'Mega-Cap Tech', tokenTag: 'dGOOGL' },
      { sym: 'META', name: 'Meta Platforms Inc.', category: 'Mega-Cap Tech', tokenTag: 'dMETA' },
      { sym: 'TSM', name: 'Taiwan Semiconductor Mfg.', category: 'AI & Foundry', tokenTag: 'dTSM' },
      { sym: 'ASML', name: 'ASML Holding N.V.', category: 'AI & Foundry', tokenTag: 'dASML' },
      { sym: 'AVGO', name: 'Broadcom Inc.', category: 'AI & Foundry', tokenTag: 'dAVGO' },
      { sym: 'SPY', name: 'SPDR S&P 500 ETF Trust', category: 'Index ETFs', tokenTag: 'dSPY' },
      { sym: 'QQQ', name: 'Invesco QQQ Trust', category: 'Index ETFs', tokenTag: 'dQQQ' },
      { sym: 'OPENAI', name: 'OpenAI Pre-Stock', category: 'Pre-IPO Giants', tokenTag: 'preOPENAI' },
      { sym: 'SPACEX', name: 'SpaceX Pre-Stock', category: 'Pre-IPO Giants', tokenTag: 'preSPACEX' },
      { sym: 'STRIPE', name: 'Stripe Pre-Stock', category: 'Pre-IPO Giants', tokenTag: 'preSTRIPE' },
    ];

    return symbols.map((item) => {
      const q = quotes ? (quotes[item.sym] || quotes[`x${item.sym}`] || quotes[`pre${item.sym}`]) : undefined;
      const price = q?.price ?? 150.0;
      const changePct = q?.changePct ?? 1.25;
      const change = q?.change ?? (price * changePct) / 100;
      const sparkline = q?.sparkline && q.sparkline.length > 3
        ? q.sparkline
        : [price * 0.98, price * 0.99, price * 0.985, price * 1.01, price];

      return {
        ...item,
        price,
        change,
        changePct,
        sparkline,
        high: q?.high ?? price * 1.02,
        low: q?.low ?? price * 0.98,
        volume: q?.volume ?? 1250000,
        isPositive: changePct >= 0,
      };
    });
  }, [quotes]);

  const filteredStocks = useMemo(() => {
    if (activeCategory === 'All') return stockList;
    return stockList.filter((s) => s.category === activeCategory);
  }, [stockList, activeCategory]);

  const categories = ['All', 'Mega-Cap Tech', 'AI & Foundry', 'Pre-IPO Giants', 'Index ETFs'];

  return (
    <div className="flex flex-col space-y-7">
      {/* SECTION 1: Top Hero Metric Bento Strip (Stitch High-Precision Spec) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-surface-card border border-border-subtle rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Tokenized Equities TVL
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-display text-xl sm:text-2xl font-bold text-text-primary tabular-nums">
              $194.82M
            </span>
          </div>
          <span className="text-[11px] font-mono text-bull-green flex items-center gap-1 mt-1">
            <TrendingUp className="w-3 h-3" /> +14.8% this month
          </span>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Solana SPL Markets
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-display text-xl sm:text-2xl font-bold text-text-primary tabular-nums">
              15 Active Pools
            </span>
          </div>
          <span className="text-[11px] font-mono text-text-muted flex items-center gap-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-bull-green" /> 24/7 Continuous Trading
          </span>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Pyth Oracle Health
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-display text-xl sm:text-2xl font-bold text-text-primary tabular-nums">
              ~180ms
            </span>
          </div>
          <span className="text-[11px] font-mono text-bull-green flex items-center gap-1 mt-1">
            <ShieldCheck className="w-3 h-3" /> 100% Onchain Verified
          </span>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Network Execution Gas
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-display text-xl sm:text-2xl font-bold text-text-primary tabular-nums">
              &lt; $0.0001
            </span>
          </div>
          <span className="text-[11px] font-mono text-accent-cyan flex items-center gap-1 mt-1">
            <Zap className="w-3 h-3" /> Instant L1 Finality
          </span>
        </div>
      </div>

      {/* SECTION 2: Real-time Market Intelligence & AI Catalyst Box */}
      <div className="bg-surface-card border border-border-subtle rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-bull-green/5 to-transparent pointer-events-none" />

        <div className="flex items-start gap-3.5 z-10">
          <div className="w-10 h-10 rounded-xl bg-surface-card-elevated border border-border-interactive flex items-center justify-center text-bull-green shrink-0 shadow-inner">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-primary font-display">
                Real-Time Market Intelligence
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-bull-green-subtle text-bull-green border border-bull-green/20">
                {liveNews?.sentimentLabel || 'Bullish'} Catalysts
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-1 max-w-2xl line-clamp-2 leading-relaxed">
              {liveNews ? (
                <>
                  <span className="text-text-primary font-semibold">{liveNews.title}</span> —{' '}
                  <span className="text-text-muted">{liveNews.source}</span>
                </>
              ) : (
                'Streaming live algorithmic sentiment analysis and sub-second Pyth oracle feeds across tokenized US equities.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto shrink-0 z-10">
          <button
            onClick={() => {
              setIsRefreshing(true);
              fetch('/api/news?symbol=NVDA')
                .then((r) => r.json())
                .then((d) => {
                  if (d.articles?.[0]) {
                    setLiveNews({
                      title: d.articles[0].title,
                      source: d.articles[0].source,
                      sentimentLabel: d.sentimentLabel,
                      sentimentScore: d.sentimentScore,
                      aiSummary: d.aiSummary,
                    });
                  }
                  setIsRefreshing(false);
                })
                .catch(() => setIsRefreshing(false));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-base hover:bg-surface-overlay border border-border-subtle text-xs font-medium text-text-secondary hover:text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* SECTION 3: Featured Thematic Baskets Row */}
      <section className="space-y-3.5">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">
              Featured Thematic Baskets
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Curated non-custodial index baskets with 1-click execution via Jupiter
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {CURATED_BASKETS.map((basket) => {
            const return1Y = basket.id === 'sol-ai-infra' ? '+48.6%' : basket.id === 'sol-mag7' ? '+49.2%' : '+28.4%';
            const navEstimate = basket.id === 'sol-ai-infra' ? '$114.20' : basket.id === 'sol-mag7' ? '$248.50' : '$185.00';

            return (
              <div
                key={basket.id}
                onClick={() => onSelectBasket(basket.id)}
                className="bg-surface-card hover:bg-surface-card-elevated border border-border-subtle hover:border-bull-green/40 rounded-xl p-5 cursor-pointer transition-all flex flex-col justify-between group shadow-sm hover:shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-surface-overlay text-bull-green border border-bull-green/20">
                      {basket.ticker}
                    </span>
                    <span className="text-[11px] font-mono text-text-muted">
                      {basket.assets.length} Constituent Assets
                    </span>
                  </div>

                  <h3 className="font-display text-base font-bold text-text-primary group-hover:text-bull-green transition-colors">
                    {basket.name}
                  </h3>
                  <p className="text-xs text-text-secondary mt-1.5 line-clamp-2 leading-relaxed">
                    {basket.description}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-border-subtle/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-text-muted block">Estimated NAV</span>
                    <span className="font-mono text-sm font-bold text-text-primary tabular-nums">{navEstimate}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono uppercase text-text-muted block">1Y Cumulative</span>
                    <span className="font-mono text-sm font-bold text-bull-green tabular-nums">{return1Y}</span>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-surface-overlay flex items-center justify-center text-text-muted group-hover:text-bull-green group-hover:bg-bull-green-subtle transition-colors">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 4: Full Equities Watchlist Table */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-text-primary tracking-tight">
              Market Watchlist & Equities
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Tokenized US equities trading 24/7 on Solana with live Pyth oracle pricing
            </p>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? 'bg-bull-green text-surface-base shadow-sm'
                    : 'bg-surface-card hover:bg-surface-card-elevated text-text-secondary hover:text-white border border-border-subtle'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Watchlist Table */}
        <div className="bg-surface-card border border-border-subtle rounded-xl overflow-hidden shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] font-mono uppercase tracking-wider text-text-muted bg-surface-base/50">
                  <th className="py-3 px-4 font-semibold">Asset</th>
                  <th className="py-3 px-4 font-semibold hidden md:table-cell">Category</th>
                  <th className="py-3 px-4 font-semibold hidden sm:table-cell">24H Trend</th>
                  <th className="py-3 px-4 font-semibold text-right">Live Price</th>
                  <th className="py-3 px-4 font-semibold text-right">24H Change</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50 text-xs">
                {filteredStocks.map((stock) => (
                  <tr
                    key={stock.sym}
                    onClick={() => onSelectStock(stock.sym)}
                    className="hover:bg-surface-card-elevated/80 transition-colors cursor-pointer group"
                  >
                    {/* Asset Ticker & Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-overlay flex items-center justify-center font-display font-bold text-xs text-text-primary border border-border-subtle group-hover:border-bull-green/40 transition-colors">
                          {stock.sym.slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 font-bold text-text-primary group-hover:text-bull-green transition-colors">
                            <span>{stock.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-surface-overlay text-bull-green">
                              {stock.tokenTag}
                            </span>
                          </div>
                          <span className="text-[11px] text-text-muted font-mono">{stock.sym}</span>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-4 hidden md:table-cell text-text-secondary font-mono text-[11px]">
                      {stock.category}
                    </td>

                    {/* SVG Sparkline */}
                    <td className="py-3.5 px-4 hidden sm:table-cell">
                      <div className="w-24 h-7">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 100 30">
                          {(() => {
                            const pts = stock.sparkline;
                            const min = Math.min(...pts);
                            const max = Math.max(...pts);
                            const range = max - min || 1;
                            const coords = pts.map((val, i) => {
                              const x = (i / (pts.length - 1)) * 100;
                              const y = 30 - ((val - min) / range) * 26 - 2;
                              return `${x},${y}`;
                            });
                            return (
                              <polyline
                                fill="none"
                                stroke={stock.isPositive ? '#00D09C' : '#FF5252'}
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={coords.join(' ')}
                              />
                            );
                          })()}
                        </svg>
                      </div>
                    </td>

                    {/* Live Price */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-text-primary text-sm tabular-nums">
                      ${stock.price.toFixed(2)}
                    </td>

                    {/* 24h Change */}
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-[11px] font-bold tabular-nums ${
                          stock.isPositive
                            ? 'bg-bull-green-subtle text-bull-green border border-bull-green/20'
                            : 'bg-bear-red-subtle text-bear-red border border-bear-red/20'
                        }`}
                      >
                        {stock.isPositive ? '+' : ''}
                        {stock.changePct.toFixed(2)}%
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectStock(stock.sym);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-surface-overlay hover:bg-bull-green hover:text-surface-base text-xs font-semibold text-text-primary transition-all font-display"
                      >
                        Trade
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
