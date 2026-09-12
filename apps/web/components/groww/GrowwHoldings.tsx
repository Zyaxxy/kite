'use client';

import React, { useState } from 'react';
import { USER_HOLDINGS, PortfolioHolding, StockItem, BasketItem, GROWW_STOCKS, POPULAR_BASKETS } from '../../lib/groww-data';
import { Eye, EyeOff, BarChart2, ArrowUpRight, TrendingUp, Sparkles, ChevronRight } from 'lucide-react';

interface GrowwHoldingsProps {
  onSelectHolding: (stock: StockItem | null, basket: BasketItem | null) => void;
}

export function GrowwHoldings({ onSelectHolding }: GrowwHoldingsProps) {
  const [showValues, setShowValues] = useState(true);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  const totalCurrent = USER_HOLDINGS.reduce((acc, h) => acc + h.currentValue, 0);
  const totalInvested = USER_HOLDINGS.reduce((acc, h) => acc + h.investedValue, 0);
  const totalReturnsAmount = totalCurrent - totalInvested;
  const totalReturnsPercent = (totalReturnsAmount / totalInvested) * 100;
  const totalDayChangeAmount = USER_HOLDINGS.reduce((acc, h) => acc + h.dayChangeAmount, 0);
  const totalDayChangePercent = (totalDayChangeAmount / totalCurrent) * 100;

  return (
    <div className="space-y-6">
      {/* Header matching Groww Screenshot 2026-09-11 203303.png */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white tracking-tight">Investments ({USER_HOLDINGS.length})</h2>
          <button
            onClick={() => setShowValues(!showValues)}
            className="p-1 rounded-full text-[#8B949E] hover:text-white hover:bg-[#1F222A] transition"
            title={showValues ? 'Hide values' : 'Show values'}
          >
            {showValues ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Portfolio Summary Card matching Groww */}
      <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs text-[#8B949E] block mb-1">Current value</span>
            <div className="text-3xl font-bold text-white font-mono tracking-tight">
              {showValues ? `₹${totalCurrent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '••••••'}
              <span className="text-xs text-[#8B949E] ml-2 font-normal">
                (${totalCurrent.toFixed(2)})
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowAnalysisModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#262A34] hover:bg-[#323642] text-xs font-semibold text-white transition shadow-sm"
          >
            <BarChart2 className="w-3.5 h-3.5 text-[#00D09C]" />
            <span>Analyse</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[#262A34] text-xs">
          <div>
            <span className="text-[#8B949E] block mb-1">Invested value</span>
            <span className="text-sm font-semibold text-white font-mono">
              {showValues ? `₹${totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '••••••'}
            </span>
          </div>
          <div>
            <span className="text-[#8B949E] block mb-1">1D returns</span>
            <span
              className={`text-sm font-semibold font-mono ${
                totalDayChangeAmount >= 0 ? 'text-[#00D09C]' : 'text-[#EB5B5B]'
              }`}
            >
              {showValues
                ? `${totalDayChangeAmount >= 0 ? '+' : ''}₹${totalDayChangeAmount.toFixed(2)} (${totalDayChangePercent.toFixed(2)}%)`
                : '••••••'}
            </span>
          </div>
          <div>
            <span className="text-[#8B949E] block mb-1">Total returns</span>
            <span
              className={`text-sm font-semibold font-mono ${
                totalReturnsAmount >= 0 ? 'text-[#00D09C]' : 'text-[#EB5B5B]'
              }`}
            >
              {showValues
                ? `${totalReturnsAmount >= 0 ? '+' : ''}₹${totalReturnsAmount.toFixed(2)} (${totalReturnsPercent.toFixed(2)}%)`
                : '••••••'}
            </span>
          </div>
          <div>
            <span className="text-[#8B949E] block mb-1">XIRR / APY</span>
            <span className="text-sm font-semibold text-white font-mono">
              {showValues ? '5.59%' : '••••••'}
            </span>
          </div>
        </div>
      </div>

      {/* Holdings Table matching Groww Screenshot 2026-09-11 203303.png */}
      <div className="bg-[#181A20] border border-[#262A34] rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#262A34] text-[#8B949E] bg-[#14161C]">
                <th className="py-3 px-4 font-semibold">Fund / Stock name</th>
                <th className="py-3 px-4 font-semibold text-right">XIRR (%)</th>
                <th className="py-3 px-4 font-semibold text-right">Day change (%)</th>
                <th className="py-3 px-4 font-semibold text-right">Returns (%)</th>
                <th className="py-3 px-4 font-semibold text-right">Current (Invested)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262A34]">
              {USER_HOLDINGS.map((h) => {
                const dayUp = h.dayChangeAmount >= 0;
                const totalUp = h.totalReturnsAmount >= 0;

                return (
                  <tr
                    key={h.id}
                    onClick={() => {
                      if (h.type === 'Stock') {
                        const s = GROWW_STOCKS[h.symbol];
                        if (s) onSelectHolding(s, null);
                      } else {
                        const b = POPULAR_BASKETS.find((bk) => bk.ticker === h.symbol);
                        if (b) onSelectHolding(null, b);
                      }
                    }}
                    className="hover:bg-[#1D2028] cursor-pointer transition"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-[#262A34] flex items-center justify-center font-bold text-white text-xs">
                          {h.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <span className="font-bold text-white block">{h.name}</span>
                          <span className="text-[11px] text-[#8B949E]">
                            {h.shares} units • {h.type}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                      {h.xirr.toFixed(2)}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">
                      <span className={`block font-semibold ${dayUp ? 'text-[#00D09C]' : 'text-[#EB5B5B]'}`}>
                        {dayUp ? '+' : ''}₹{h.dayChangeAmount.toFixed(2)}
                      </span>
                      <span className={`text-[11px] ${dayUp ? 'text-[#00D09C]' : 'text-[#EB5B5B]'}`}>
                        {dayUp ? '+' : ''}{h.dayChangePercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">
                      <span className={`block font-semibold ${totalUp ? 'text-[#00D09C]' : 'text-[#EB5B5B]'}`}>
                        {totalUp ? '+' : ''}₹{h.totalReturnsAmount.toFixed(2)}
                      </span>
                      <span className={`text-[11px] ${totalUp ? 'text-[#00D09C]' : 'text-[#EB5B5B]'}`}>
                        {totalUp ? '+' : ''}{h.totalReturnsPercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">
                      <span className="font-bold text-white block">
                        ₹{h.currentValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-[11px] text-[#8B949E]">
                        ₹{h.investedValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analysis Modal */}
      {showAnalysisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-[#181A20] border border-[#262A34] rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#262A34]">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-[#00D09C]" />
                <h3 className="text-base font-bold text-white">Portfolio Analysis</h3>
              </div>
              <button
                onClick={() => setShowAnalysisModal(false)}
                className="text-xs text-[#8B949E] hover:text-white px-2 py-1 rounded hover:bg-[#262A34]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-[#121212] p-4 rounded-xl border border-[#262A34] space-y-3">
                <h4 className="font-bold text-white">Asset Allocation</h4>
                <div className="h-3 w-full rounded-full overflow-hidden flex">
                  <div className="bg-[#00D09C]" style={{ width: '60%' }} title="Baskets (60%)" />
                  <div className="bg-blue-500" style={{ width: '25%' }} title="Tech Stocks (25%)" />
                  <div className="bg-purple-500" style={{ width: '15%' }} title="USDC (15%)" />
                </div>
                <div className="flex justify-between text-[11px] text-[#8B949E]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00D09C]" /> Thematic Baskets (60%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Individual Equities (25%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Liquid Cash (15%)
                  </span>
                </div>
              </div>

              <div className="bg-[#121212] p-4 rounded-xl border border-[#262A34] space-y-2">
                <h4 className="font-bold text-white">Risk & Volatility Summary</h4>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-[#8B949E] block">Sharpe Ratio</span>
                    <span className="text-white font-mono font-bold">2.14 (Institutional)</span>
                  </div>
                  <div>
                    <span className="text-[#8B949E] block">Beta vs SPY</span>
                    <span className="text-white font-mono font-bold">1.08</span>
                  </div>
                  <div>
                    <span className="text-[#8B949E] block">Max Drawdown</span>
                    <span className="text-[#00D09C] font-mono font-bold">-4.2%</span>
                  </div>
                  <div>
                    <span className="text-[#8B949E] block">Custody Mode</span>
                    <span className="text-white font-mono font-bold">100% Non-Custodial</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowAnalysisModal(false)}
              className="w-full py-2.5 bg-[#00D09C] text-[#0A261D] font-bold rounded-lg hover:bg-[#00e2ab] transition"
            >
              Close Analysis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
