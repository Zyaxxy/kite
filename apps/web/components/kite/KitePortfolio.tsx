'use client';

import React from 'react';
import { PORTFOLIO_HOLDINGS, PortfolioHolding } from '../../lib/kite-data';
import { ShieldCheck, Wallet, ArrowUpRight } from 'lucide-react';

interface KitePortfolioProps {
  onSelectAsset: (symbol: string, isBasket: boolean) => void;
}

export function KitePortfolio({ onSelectAsset }: KitePortfolioProps) {
  const totalCurrent = PORTFOLIO_HOLDINGS.reduce((acc, h) => acc + h.currentValue, 0);
  const totalInvested = PORTFOLIO_HOLDINGS.reduce((acc, h) => acc + h.investedValue, 0);
  const totalReturns = totalCurrent - totalInvested;
  const totalReturnsPct = (totalReturns / totalInvested) * 100;

  return (
    <div className="flex flex-col space-y-6">
      {/* Portfolio Summary Card */}
      <div className="bg-raised border border-line rounded-xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs text-muted block mb-1">Total Non-Custodial Value</span>
            <div className="text-3xl sm:text-4xl font-bold font-mono text-ink tracking-tight">
              ${totalCurrent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-xs text-muted font-normal ml-2">USDC</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg border border-line text-xs font-mono text-muted">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span>Onchain Wallet</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-line text-xs">
          <div>
            <span className="text-muted block mb-1">Total Invested</span>
            <span className="text-sm font-semibold text-ink font-mono">
              ${totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-muted block mb-1">Unrealized PnL</span>
            <span
              className={`text-sm font-semibold font-mono ${
                totalReturns >= 0 ? 'text-up' : 'text-down'
              }`}
            >
              {totalReturns >= 0 ? '+' : ''}${totalReturns.toFixed(2)} ({totalReturnsPct.toFixed(2)}%)
            </span>
          </div>
          <div>
            <span className="text-muted block mb-1">Custody Model</span>
            <span className="text-sm font-semibold text-accent font-mono">
              100% Non-Custodial
            </span>
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold text-ink tracking-tight">
            Tokenized Holdings ({PORTFOLIO_HOLDINGS.length})
          </h2>
          <span className="text-xs text-muted font-mono">SPL Token Accounts</span>
        </div>

        <div className="border border-line rounded-xl overflow-hidden bg-raised shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-muted bg-bg/50">
                  <th className="py-3 px-4 font-semibold">Asset</th>
                  <th className="py-3 px-4 font-semibold text-right">Holdings</th>
                  <th className="py-3 px-4 font-semibold text-right">Market Price</th>
                  <th className="py-3 px-4 font-semibold text-right">Current Value</th>
                  <th className="py-3 px-4 font-semibold text-right">PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {PORTFOLIO_HOLDINGS.map((h) => {
                  const pnl = h.currentValue - h.investedValue;
                  const pnlPct = (pnl / h.investedValue) * 100;
                  const isUp = pnl >= 0;

                  return (
                    <tr
                      key={h.id}
                      onClick={() => onSelectAsset(h.symbol, h.type === 'Basket')}
                      className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded bg-bg border border-line flex items-center justify-center font-bold text-ink text-[11px] font-mono">
                            {h.symbol.slice(0, 3)}
                          </div>
                          <div>
                            <span className="font-bold text-ink block">{h.name}</span>
                            <span className="text-[11px] text-muted font-mono">
                              {h.symbol} · {h.type}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-medium text-ink">
                        {h.shares} units
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-ink">
                        ${h.currentPrice.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-ink">
                        ${h.currentValue.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        <span className={`font-semibold ${isUp ? 'text-up' : 'text-down'}`}>
                          {isUp ? '+' : ''}${pnl.toFixed(2)} ({isUp ? '+' : ''}{pnlPct.toFixed(2)}%)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
