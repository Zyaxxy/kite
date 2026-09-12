'use client';

import React, { useState } from 'react';
import {
  POPULAR_BASKETS,
  GROWW_COLLECTIONS,
  GROWW_STOCKS,
  TOP_MOVERS,
  TRENDING_SECTORS,
  STOCKS_IN_NEWS,
  TRADING_SCREENS,
  StockItem,
  BasketItem
} from '../../lib/groww-data';
import { ChevronRight, ArrowUpRight, TrendingUp, TrendingDown, Sparkles, Zap, Shield, Info, AlertCircle } from 'lucide-react';

interface GrowwExploreProps {
  onSelectStock: (stock: StockItem) => void;
  onSelectBasket: (basket: BasketItem) => void;
  onViewAllBaskets: () => void;
}

export function GrowwExplore({ onSelectStock, onSelectBasket, onViewAllBaskets }: GrowwExploreProps) {
  const [moverTab, setMoverTab] = useState<'Gainers' | 'Losers' | 'Volume shockers'>('Gainers');

  const filteredMovers = TOP_MOVERS.filter((m) => {
    if (moverTab === 'Gainers') return m.up;
    if (moverTab === 'Losers') return !m.up;
    return true; // volume shockers
  });

  return (
    <div className="space-y-10">
      {/* Solana Tokenized Notice Banner matching Groww Screenshot 2026-09-12 132534.png */}
      <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-4 sm:p-5 flex items-center justify-between shadow-lg relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-[#00D09C]/20 to-blue-500/20 border border-[#00D09C]/30 flex items-center justify-center text-xl shrink-0">
            ⚡
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Tokenized US Equities 24/7 Trading Live on Solana</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-[#00D09C] border border-emerald-500/30">
                Pyth Feeds
              </span>
            </h3>
            <p className="text-xs text-[#8B949E] mt-0.5 max-w-xl">
              Trade Apple, Nvidia, and Tesla round-the-clock with sub-second finality. Zero counterparty custody risk.
            </p>
          </div>
        </div>
      </div>

      {/* Popular Baskets / Funds matching Groww Screenshot 2026-09-11 203251.png */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight">Popular Baskets</h2>
          <button
            onClick={onViewAllBaskets}
            className="text-xs font-semibold text-[#00D09C] hover:underline flex items-center gap-1"
          >
            All Baskets <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {POPULAR_BASKETS.map((basket) => (
            <div
              key={basket.id}
              onClick={() => onSelectBasket(basket)}
              className="bg-[#181A20] hover:bg-[#1D2028] border border-[#262A34] hover:border-[#00D09C]/50 rounded-xl p-4 cursor-pointer transition shadow-md group flex flex-col justify-between"
            >
              <div>
                <div className="h-10 w-10 rounded-lg bg-[#262A34] flex items-center justify-center text-xl mb-3 shadow-inner">
                  {basket.icon}
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-[#00D09C] transition-colors leading-snug">
                  {basket.name}
                </h3>
              </div>

              <div className="mt-5 flex items-baseline justify-between pt-3 border-t border-[#262A34]">
                <div>
                  <span className="text-xs font-bold text-[#00D09C] font-mono">
                    +{basket.return3Y.toFixed(2)}%
                  </span>
                  <span className="text-[11px] text-[#8B949E] ml-1.5">3Y</span>
                </div>
                <span className="text-[11px] text-[#8B949E] font-medium">{basket.assetsCount} assets</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Collections matching Groww Screenshot 2026-09-11 203251.png */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-white tracking-tight">Collections</h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {GROWW_COLLECTIONS.map((c) => (
            <div
              key={c.id}
              onClick={onViewAllBaskets}
              className="bg-[#181A20] hover:bg-[#1D2028] border border-[#262A34] hover:border-[#00D09C]/40 rounded-xl p-4 flex flex-col items-center text-center cursor-pointer transition shadow-md group"
            >
              <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-[#262A34] to-[#1F222A] flex items-center justify-center text-2xl mb-2.5 shadow-sm group-hover:scale-110 transition-transform">
                {c.icon}
              </div>
              <span className="text-xs font-semibold text-white group-hover:text-[#00D09C] transition-colors">
                {c.title}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Most Bought Stocks on Kite matching Groww Screenshot 2026-09-12 132515.png */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-white tracking-tight">Most bought stocks on Kite</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {['NVDA', 'AAPL', 'TSLA', 'MSFT'].map((sym) => {
            const stock = GROWW_STOCKS[sym];
            if (!stock) return null;
            const isUp = stock.change1d >= 0;

            return (
              <div
                key={sym}
                onClick={() => onSelectStock(stock)}
                className="bg-[#181A20] hover:bg-[#1D2028] border border-[#262A34] hover:border-[#00D09C]/50 rounded-xl p-4 cursor-pointer transition shadow-md group"
              >
                <div className="h-10 w-10 rounded-lg bg-[#262A34] flex items-center justify-center text-base font-bold text-white mb-3">
                  {sym.slice(0, 2)}
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-[#00D09C] transition-colors">
                  {stock.name}
                </h3>
                <div className="mt-4 pt-3 border-t border-[#262A34] flex items-baseline justify-between">
                  <span className="text-sm font-bold text-white font-mono">${stock.price.toFixed(2)}</span>
                  <span
                    className={`text-xs font-semibold font-mono ${
                      isUp ? 'text-[#00D09C]' : 'text-[#EB5B5B]'
                    }`}
                  >
                    {isUp ? '+' : ''}
                    {stock.change1dAmount.toFixed(2)} ({stock.change1d.toFixed(2)}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top Movers Today matching Groww Screenshot 2026-09-12 132700.png */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight">Top movers today</h2>
          <div className="flex items-center gap-1 bg-[#181A20] p-1 rounded-lg border border-[#262A34] text-xs">
            {(['Gainers', 'Losers', 'Volume shockers'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMoverTab(tab)}
                className={`px-3 py-1 rounded-md font-semibold transition ${
                  moverTab === tab
                    ? 'bg-[#262A34] text-white shadow-sm'
                    : 'text-[#8B949E] hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#181A20] border border-[#262A34] rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#262A34] text-[#8B949E] bg-[#14161C]">
                  <th className="py-3 px-4 font-semibold">Company</th>
                  <th className="py-3 px-4 font-semibold text-center">Trend (1D)</th>
                  <th className="py-3 px-4 font-semibold text-right">Market price</th>
                  <th className="py-3 px-4 font-semibold text-right">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262A34]">
                {filteredMovers.map((m) => (
                  <tr
                    key={m.symbol}
                    onClick={() => {
                      const st = GROWW_STOCKS[m.symbol] || {
                        symbol: m.symbol,
                        name: m.name,
                        exchange: 'NASDAQ • SPL',
                        category: 'Equities',
                        price: m.price,
                        change1d: m.change,
                        change1dAmount: (m.price * m.change) / 100,
                        sparkline: m.sparkline,
                        volume24h: m.volume,
                        marketCap: '$2,00,000Cr',
                        peRatio: 40.0,
                        pbRatio: 8.0,
                        industryPe: 35.0,
                        debtToEquity: 0.2,
                        roe: 0.25,
                        eps: 5.0,
                        divYield: 0.0,
                        bookValue: 20.0,
                        faceValue: 1.0,
                        todayLow: m.price * 0.98,
                        todayHigh: m.price * 1.02,
                        week52Low: m.price * 0.7,
                        week52High: m.price * 1.3,
                        openPrice: m.price * 0.99,
                        prevClose: m.price * (1 - m.change / 100),
                        lowerCircuit: m.price * 0.9,
                        upperCircuit: m.price * 1.1,
                        pythFeedId: '0x0000000000000000000000000000000000000000',
                        mintAddress: `${m.symbol}TokenMint111111111111111111111111111`,
                        sentimentScore: m.up ? 0.7 : -0.3,
                        sentimentLabel: m.up ? 'Bullish' : 'Bearish',
                        news: [],
                        quarterly: []
                      };
                      onSelectStock(st);
                    }}
                    className="hover:bg-[#1D2028] cursor-pointer transition"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-[#262A34] flex items-center justify-center font-bold text-white text-xs">
                          {m.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <span className="font-bold text-white block">{m.symbol}</span>
                          <span className="text-[11px] text-[#8B949E]">{m.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="h-6 w-24 mx-auto">
                        <svg viewBox="0 0 100 25" className="w-full h-full overflow-visible">
                          <polyline
                            fill="none"
                            stroke={m.up ? '#00D09C' : '#EB5B5B'}
                            strokeWidth="2"
                            strokeLinecap="round"
                            points="0,18 25,14 50,16 75,8 100,5"
                          />
                        </svg>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="font-mono font-bold text-white block">${m.price.toFixed(2)}</span>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          m.up ? 'text-[#00D09C]' : 'text-[#EB5B5B]'
                        }`}
                      >
                        {m.up ? '+' : ''}
                        {m.change.toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-[#8B949E]">{m.volume}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Sectors Trending Today matching Groww Screenshot 2026-09-12 132708.png */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-white tracking-tight">Sectors trending today</h2>

        <div className="bg-[#181A20] border border-[#262A34] rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#262A34] text-[#8B949E] bg-[#14161C]">
                  <th className="py-3 px-4 font-semibold">Sector</th>
                  <th className="py-3 px-4 font-semibold">Gainers / Losers</th>
                  <th className="py-3 px-4 font-semibold text-right">1D price change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262A34]">
                {TRENDING_SECTORS.map((s) => {
                  const total = s.gainers + s.losers;
                  const gainerPercent = (s.gainers / total) * 100;

                  return (
                    <tr key={s.name} className="hover:bg-[#1D2028] transition">
                      <td className="py-3.5 px-4 font-bold text-white">{s.name}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-[#00D09C] font-mono font-bold">{s.gainers}</span>
                          <div className="h-1.5 w-36 sm:w-48 bg-[#EB5B5B] rounded-full overflow-hidden flex">
                            <div className="h-full bg-[#00D09C]" style={{ width: `${gainerPercent}%` }} />
                          </div>
                          <span className="text-[11px] text-[#EB5B5B] font-mono font-bold">{s.losers}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`font-mono font-bold ${
                            s.up ? 'text-[#00D09C]' : 'text-[#EB5B5B]'
                          }`}
                        >
                          {s.up ? '+' : ''}
                          {s.change.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Stocks in News Today matching Groww Screenshot 2026-09-12 132715.png */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-white tracking-tight">Stocks in news today</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {STOCKS_IN_NEWS.map((item, idx) => (
            <div
              key={idx}
              onClick={() => {
                const st = GROWW_STOCKS[item.symbol];
                if (st) onSelectStock(st);
              }}
              className="bg-[#181A20] hover:bg-[#1D2028] border border-[#262A34] hover:border-[#00D09C]/40 rounded-xl p-4 cursor-pointer transition shadow-md group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-[#262A34] flex items-center justify-center font-bold text-white text-xs">
                      {item.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-[#00D09C] transition-colors">
                        {item.name}
                      </h4>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-mono font-bold ${
                      item.up ? 'text-[#00D09C]' : 'text-[#EB5B5B]'
                    }`}
                  >
                    {item.up ? '+' : ''}
                    {item.change.toFixed(2)}%
                  </span>
                </div>
                <p className="text-xs text-[#8B949E] mt-3 leading-relaxed">{item.headline}</p>
              </div>
              <span className="text-[10px] text-[#8B949E] mt-4 pt-2 border-t border-[#262A34] block">
                {item.time}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Trading Screens matching Groww Screenshot 2026-09-12 132700.png */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-white tracking-tight">Trading screens & Technical signals</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TRADING_SCREENS.map((screen, idx) => (
            <div
              key={idx}
              className="bg-[#181A20] border border-[#262A34] rounded-xl p-4 shadow-md flex flex-col justify-between"
            >
              <div>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-block mb-2 ${
                    screen.type === 'Bullish'
                      ? 'bg-emerald-500/20 text-[#00D09C]'
                      : 'bg-rose-500/20 text-[#EB5B5B]'
                  }`}
                >
                  {screen.type}
                </span>
                <h4 className="text-xs font-bold text-white">{screen.title}</h4>
              </div>

              {/* Graphic pattern simulation */}
              <div className="h-10 w-full mt-4 flex items-center justify-center bg-[#121212] rounded-lg border border-[#262A34]/50 p-2">
                <svg viewBox="0 0 100 24" className="w-full h-full">
                  <path
                    d="M 0,20 Q 25,4 50,16 T 100,6"
                    fill="none"
                    stroke={screen.type === 'Bullish' ? '#00D09C' : '#EB5B5B'}
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
