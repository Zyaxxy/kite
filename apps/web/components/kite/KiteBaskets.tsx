'use client';

import React from 'react';
import { KITE_BASKETS } from '../../lib/kite-data';
import { ArrowUpRight, Layers } from 'lucide-react';

interface KiteBasketsProps {
  onSelectBasket: (basketId: string) => void;
}

export function KiteBaskets({ onSelectBasket }: KiteBasketsProps) {
  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Curated Thematic Baskets</h1>
        <p className="text-xs text-muted mt-1">
          Diversified tokenized indexes rebalanced periodically, minted atomically via Jupiter swaps.
        </p>
      </div>

      <div className="space-y-4">
        {KITE_BASKETS.map((basket) => (
          <div
            key={basket.id}
            onClick={() => onSelectBasket(basket.id)}
            className="bg-raised hover:bg-white/[0.03] border border-line hover:border-accent/40 rounded-xl p-5 sm:p-6 cursor-pointer transition-all space-y-4 shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded font-mono text-xs font-bold bg-white/10 text-ink">
                  {basket.ticker}
                </span>
                <h2 className="text-lg font-bold text-ink">{basket.name}</h2>
              </div>
              <span className="text-xs text-muted font-mono">
                {basket.rebalanceIntervalDays}d Rebalance Interval
              </span>
            </div>

            <p className="text-xs text-muted leading-relaxed">{basket.description}</p>

            {/* Constituents with proportional weight bars */}
            <div className="space-y-2 pt-2 border-t border-line">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block">
                Constituents ({basket.assets.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {basket.assets.map((asset) => {
                  const weightPct = asset.weight > 100 ? (asset.weight / 100).toFixed(1) : asset.weight;
                  return (
                    <div
                      key={asset.symbol}
                      className="p-2.5 rounded-lg bg-bg border border-line flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-ink font-mono">{asset.symbol}</span>
                        <span className="text-muted block text-[11px]">{asset.name}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="w-16 h-1.5 bg-raised rounded-full overflow-hidden hidden sm:block">
                          <div className="h-full bg-accent" style={{ width: `${weightPct}%` }} />
                        </div>
                        <span className="font-mono text-ink font-semibold w-10 text-right">
                          {weightPct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-xs font-bold text-accent flex items-center gap-1">
                Mint or Simulate Basket <ArrowUpRight className="w-4 h-4" />
              </span>
              <span className="text-[11px] text-muted font-mono">Non-custodial SPL mint</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
