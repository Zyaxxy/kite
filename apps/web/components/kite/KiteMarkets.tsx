'use client';

import React, { useEffect, useState } from 'react';
import { KITE_STOCKS, KITE_BASKETS, KiteStock } from '../../lib/kite-data';
import { Sparkles, ArrowUpRight, TrendingUp, ShieldCheck } from 'lucide-react';

interface KiteMarketsProps {
  onSelectStock: (symbol: string) => void;
  onSelectBasket: (basketId: string) => void;
}

export function KiteMarkets({ onSelectStock, onSelectBasket }: KiteMarketsProps) {
  const [liveNews, setLiveNews] = useState<{ title: string; source: string; sentiment: string } | null>(null);

  useEffect(() => {
    // Fetch live market-wide real-time news & AI sentiment
    fetch('/api/news?symbol=NVDA')
      .then((res) => res.json())
      .then((data) => {
        if (data.articles && data.articles.length > 0) {
          setLiveNews({
            title: data.articles[0].title,
            source: data.articles[0].source,
            sentiment: data.sentimentLabel,
          });
        }
      })
      .catch(() => {
        // graceful
      });
  }, []);

  return (
    <div className="flex flex-col space-y-8">
      {/* Real-time Market Banner with Live AI News Headline */}
      <div className="bg-raised border border-line rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="h-9 w-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink">
                Live Market Intelligence
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/15 text-accent border border-accent/30">
                Pyth 24/7
              </span>
            </div>
            <p className="text-xs text-muted mt-1 max-w-xl line-clamp-2">
              {liveNews ? (
                <>
                  <span className="text-ink font-medium">{liveNews.title}</span> — {liveNews.source}
                </>
              ) : (
                'Sub-second onchain pricing and Pyth oracle confidence intervals streaming on Solana.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <span className="text-[11px] font-mono text-muted">Solana Finality:</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-up border border-up/30">
            ~400ms
          </span>
        </div>
      </div>

      {/* Thematic Baskets Section */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink tracking-tight">Thematic Baskets</h2>
            <p className="text-xs text-muted mt-0.5">
              1-click diversified exposure minted directly into your wallet via Jupiter
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {KITE_BASKETS.map((basket) => (
            <div
              key={basket.id}
              onClick={() => onSelectBasket(basket.id)}
              className="bg-raised hover:bg-white/[0.04] border border-line hover:border-accent/50 rounded-xl p-5 cursor-pointer transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-white/10 text-ink">
                    {basket.ticker}
                  </span>
                  <span className="text-[11px] text-muted font-medium">
                    {basket.assets.length} Assets
                  </span>
                </div>
                <h3 className="text-base font-bold text-ink group-hover:text-accent transition-colors">
                  {basket.name}
                </h3>
                <p className="text-xs text-muted mt-1.5 line-clamp-2 leading-relaxed">
                  {basket.description}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-line flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-accent flex items-center gap-1">
                  View Basket <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
                <span className="text-[11px] text-muted font-mono">
                  {basket.rebalanceIntervalDays}d Rebalance
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tokenized Equities List Section */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink tracking-tight">Tokenized Equities</h2>
            <p className="text-xs text-muted mt-0.5">
              SPL token shares backed 1:1, settling non-custodially on Solana
            </p>
          </div>
          <span className="text-xs text-muted font-mono">{KITE_STOCKS.length} Assets Listed</span>
        </div>

        <div className="border border-line rounded-xl overflow-hidden bg-raised shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-muted bg-bg/50">
                  <th className="py-3 px-4 font-semibold">Asset / Symbol</th>
                  <th className="py-3 px-4 font-semibold text-right">Price (USD)</th>
                  <th className="py-3 px-4 font-semibold text-right">24h Change</th>
                  <th className="py-3 px-4 font-semibold text-center hidden md:table-cell">Category</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {KITE_STOCKS.map((stock: KiteStock) => {
                  const isUp = stock.change24h >= 0;
                  return (
                    <tr
                      key={stock.symbol}
                      onClick={() => onSelectStock(stock.symbol)}
                      className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-bg border border-line flex items-center justify-center font-bold text-ink text-xs shrink-0 font-mono">
                            {stock.symbol.slice(0, 3)}
                          </div>
                          <div>
                            <span className="font-bold text-ink block">{stock.name}</span>
                            <span className="text-[11px] text-muted font-mono">{stock.symbol}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-ink">
                        ${stock.price.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        <span className={`font-semibold ${isUp ? 'text-up' : 'text-down'}`}>
                          {isUp ? '+' : ''}
                          {stock.change24h.toFixed(2)}%
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center hidden md:table-cell">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-bg border border-line text-muted font-medium">
                          {stock.category}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectStock(stock.symbol);
                          }}
                          className="px-2.5 py-1 rounded bg-bg hover:bg-white/10 border border-line text-[11px] font-semibold text-ink transition-colors"
                        >
                          Trade
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
