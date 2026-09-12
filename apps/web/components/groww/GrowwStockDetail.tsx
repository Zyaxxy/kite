'use client';

import React, { useState } from 'react';
import { StockItem, BasketItem, GROWW_STOCKS } from '../../lib/groww-data';
import {
  Share2,
  Bell,
  Bookmark,
  Calendar,
  ChevronRight,
  TrendingUp,
  BarChart3,
  ExternalLink,
  Shield,
  Activity,
  ArrowLeft
} from 'lucide-react';

interface GrowwStockDetailProps {
  stock?: StockItem | null;
  basket?: BasketItem | null;
  onBack: () => void;
  onSelectStock: (stock: StockItem) => void;
  onCreateSIP: (symbol: string) => void;
}

export function GrowwStockDetail({
  stock,
  basket,
  onBack,
  onSelectStock,
  onCreateSIP
}: GrowwStockDetailProps) {
  const [activeTimeframe, setActiveTimeframe] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | '3Y' | '5Y' | 'All'>('1D');
  const [activeTab, setActiveTab] = useState<'Overview' | 'Technicals' | 'News' | 'Events' | 'Constituents'>('Overview');
  const [chartMode, setChartMode] = useState<'line' | 'candle'>('line');
  const [bookmarked, setBookmarked] = useState(false);
  const [alertActive, setAlertActive] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ price: number; index: number } | null>(null);

  // Fallback to NVDA if neither provided
  const currentStock = stock || (basket ? null : GROWW_STOCKS['NVDA']);
  const isBasket = !!basket;

  const symbol = isBasket ? basket.ticker : currentStock!.symbol;
  const name = isBasket ? basket.name : currentStock!.name;
  const price = isBasket ? basket.nav : currentStock!.price;
  const change1d = isBasket ? basket.change1d : currentStock!.change1d;
  const isUp = change1d >= 0;

  // Chart data simulation across timeframes
  const timeMultipliers: Record<string, number> = {
    '1D': 1,
    '1W': 1.03,
    '1M': 1.08,
    '3M': 1.15,
    '1Y': 1.45,
    '3Y': 2.10,
    '5Y': 3.40,
    'All': 4.80
  };

  const basePoints = [
    price * 0.96,
    price * 0.975,
    price * 0.968,
    price * 0.985,
    price * 0.98,
    price * 0.995,
    price * 0.99,
    price * 1.01,
    price * 1.005,
    price * (isUp ? 1.02 : 0.98),
    price * (isUp ? 1.038 : 0.965)
  ];

  const currentPoints = basePoints.map((p, i) => {
    const factor = (timeMultipliers[activeTimeframe] - 1) * 0.5;
    return p * (1 + factor * (i / basePoints.length));
  });

  const minVal = Math.min(...currentPoints);
  const maxVal = Math.max(...currentPoints);
  const range = maxVal - minVal || 1;

  const svgWidth = 720;
  const svgHeight = 240;
  const paddingY = 24;

  const coords = currentPoints.map((val, idx) => {
    const x = (idx / (currentPoints.length - 1)) * svgWidth;
    const y = svgHeight - paddingY - ((val - minVal) / range) * (svgHeight - paddingY * 2);
    return { x, y, val };
  });

  const polylineStr = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `M 0,${svgHeight} L ${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L ')} L ${svgWidth},${svgHeight} Z`;

  return (
    <div className="space-y-6">
      {/* Back button and Action Bar matching Groww */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-[#8B949E] hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Markets</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="p-2 rounded-full bg-[#181A20] border border-[#262A34] text-[#8B949E] hover:text-white transition"
            title="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setAlertActive(!alertActive)}
            className={`p-2 rounded-full border transition ${
              alertActive
                ? 'bg-[#00D09C]/20 border-[#00D09C] text-[#00D09C]'
                : 'bg-[#181A20] border-[#262A34] text-[#8B949E] hover:text-white'
            }`}
            title="Price Alert"
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            onClick={() => setBookmarked(!bookmarked)}
            className={`p-2 rounded-full border transition ${
              bookmarked
                ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                : 'bg-[#181A20] border-[#262A34] text-[#8B949E] hover:text-white'
            }`}
            title="Watchlist"
          >
            <Bookmark className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Stock Header matching Groww Screenshot 2026-09-12 132610.png */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-[#1F222A] border border-[#262A34] flex items-center justify-center text-xl font-bold text-white shadow-md">
            {isBasket ? basket.icon : symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider">
                {symbol} • {isBasket ? 'THEMATIC BASKET' : currentStock!.exchange}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-[#00D09C] border border-emerald-500/30">
                Pyth Live
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-0.5">{name}</h1>
          </div>
        </div>

        <div className="text-right">
          <div className="text-3xl font-bold text-white font-mono tracking-tight">
            ${hoveredPoint ? hoveredPoint.price.toFixed(2) : price.toFixed(2)}
          </div>
          <div
            className={`text-xs font-semibold font-mono mt-0.5 ${
              isUp ? 'text-[#00D09C]' : 'text-[#EB5B5B]'
            }`}
          >
            {isUp ? '+' : ''}
            {isBasket
              ? `${(price * (change1d / 100)).toFixed(2)} (${change1d.toFixed(2)}%) 1D`
              : `${currentStock!.change1dAmount > 0 ? '+' : ''}${currentStock!.change1dAmount.toFixed(2)} (${change1d.toFixed(2)}%) 1D`}
          </div>
        </div>
      </div>

      {/* Interactive SVG Financial Chart */}
      <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-5 shadow-xl relative overflow-hidden">
        {/* Chart SVG */}
        <div className="relative h-60 w-full">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            preserveAspectRatio="none"
            className="w-full h-full overflow-visible"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <defs>
              <linearGradient id="growwChartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isUp ? '#00D09C' : '#EB5B5B'} stopOpacity="0.35" />
                <stop offset="100%" stopColor={isUp ? '#00D09C' : '#EB5B5B'} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Baseline dotted line */}
            <line
              x1="0"
              y1={svgHeight - paddingY - 30}
              x2={svgWidth}
              y2={svgHeight - paddingY - 30}
              stroke="#262A34"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />

            {/* Area Fill */}
            <path d={areaPath} fill="url(#growwChartGrad)" />

            {/* Glowing Line */}
            <polyline
              fill="none"
              stroke={isUp ? '#00D09C' : '#EB5B5B'}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={polylineStr}
            />

            {/* Interactive Points */}
            {coords.map((c, idx) => (
              <circle
                key={idx}
                cx={c.x}
                cy={c.y}
                r={hoveredPoint?.index === idx ? 6 : 3}
                fill={isUp ? '#00D09C' : '#EB5B5B'}
                stroke="#121212"
                strokeWidth="2"
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHoveredPoint({ price: c.val, index: idx })}
              />
            ))}
          </svg>
        </div>

        {/* Timeframe Selectors & Chart Tools matching Groww */}
        <div className="flex items-center justify-between pt-4 border-t border-[#262A34] mt-2">
          <div className="flex items-center space-x-1 sm:space-x-2">
            {(['1D', '1W', '1M', '3M', '1Y', '3Y', '5Y', 'All'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setActiveTimeframe(tf)}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                  activeTimeframe === tf
                    ? 'bg-[#262A34] text-white shadow-sm'
                    : 'text-[#8B949E] hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setChartMode(chartMode === 'line' ? 'candle' : 'line')}
              className="p-1.5 rounded-lg bg-[#262A34] text-[#8B949E] hover:text-white text-xs flex items-center gap-1"
              title="Toggle Chart Style"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* "Create Stock SIP" Promo Banner matching Groww Screenshot 2026-09-12 132610.png */}
      <div
        onClick={() => onCreateSIP(symbol)}
        className="bg-[#181A20] hover:bg-[#1D2028] border border-[#262A34] hover:border-[#00D09C]/40 rounded-xl p-4 flex items-center justify-between cursor-pointer transition shadow-md group"
      >
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[#00D09C]">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white group-hover:text-[#00D09C] transition-colors">
              Create Stock SIP
            </h4>
            <p className="text-xs text-[#8B949E]">
              Automate your recurring dollar-cost-average investments in this {isBasket ? 'basket' : 'stock'} via Solana Jupiter
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-[#8B949E] group-hover:text-white group-hover:translate-x-0.5 transition-transform" />
      </div>

      {/* Detail Tabs: Overview, Technicals, News, Constituents */}
      <div className="border-b border-[#262A34]">
        <div className="flex space-x-8">
          {(isBasket
            ? ['Overview', 'Constituents', 'Technicals', 'News']
            : ['Overview', 'Technicals', 'News', 'Events']
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`pb-3 text-sm font-semibold relative transition-colors ${
                activeTab === tab ? 'text-white' : 'text-[#8B949E] hover:text-white'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00D09C]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'Overview' && (
        <div className="space-y-6">
          {/* Performance Section matching Groww Screenshot 2026-09-12 132610.png */}
          <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-5 shadow-lg space-y-5">
            <h3 className="text-sm font-bold text-white">Performance</h3>

            {/* Today's Low vs High */}
            <div>
              <div className="flex justify-between text-xs text-[#8B949E] mb-2">
                <div>
                  <span className="block text-[11px]">Today&apos;s low</span>
                  <span className="font-mono text-white font-semibold">
                    ${isBasket ? (price * 0.98).toFixed(2) : currentStock!.todayLow.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[11px]">Today&apos;s high</span>
                  <span className="font-mono text-white font-semibold">
                    ${isBasket ? (price * 1.02).toFixed(2) : currentStock!.todayHigh.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-[#262A34] rounded-full relative overflow-visible">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-[#00D09C] rounded-full"
                  style={{ width: '65%' }}
                />
                <div
                  className="absolute -top-1.5 -ml-1.5 w-0 h-0 border-x-4 border-x-transparent border-t-[6px] border-t-white"
                  style={{ left: '65%' }}
                />
              </div>
            </div>

            {/* 52 Week Low vs High */}
            <div>
              <div className="flex justify-between text-xs text-[#8B949E] mb-2">
                <div>
                  <span className="block text-[11px]">52 week low</span>
                  <span className="font-mono text-white font-semibold">
                    ${isBasket ? (price * 0.65).toFixed(2) : currentStock!.week52Low.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[11px]">52 week high</span>
                  <span className="font-mono text-white font-semibold">
                    ${isBasket ? (price * 1.45).toFixed(2) : currentStock!.week52High.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-[#262A34] rounded-full relative overflow-visible">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-[#00D09C] rounded-full"
                  style={{ width: '78%' }}
                />
                <div
                  className="absolute -top-1.5 -ml-1.5 w-0 h-0 border-x-4 border-x-transparent border-t-[6px] border-t-white"
                  style={{ left: '78%' }}
                />
              </div>
            </div>

            {/* Stats Row */}
            {!isBasket && currentStock && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-3 border-t border-[#262A34] text-xs">
                <div>
                  <span className="text-[#8B949E] block">Open price</span>
                  <span className="font-mono text-white font-medium">${currentStock.openPrice.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block">Prev. close</span>
                  <span className="font-mono text-white font-medium">${currentStock.prevClose.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block">Live volume</span>
                  <span className="font-mono text-white font-medium">{currentStock.volume24h}</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block">Lower circuit</span>
                  <span className="font-mono text-white font-medium">${currentStock.lowerCircuit.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block">Upper circuit</span>
                  <span className="font-mono text-white font-medium">${currentStock.upperCircuit.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Fundamentals Grid matching Groww Screenshot 2026-09-12 132625.png */}
          {!isBasket && currentStock && (
            <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-5 shadow-lg space-y-4">
              <h3 className="text-sm font-bold text-white">Fundamentals</h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-6 text-xs">
                <div>
                  <span className="text-[#8B949E] block mb-0.5">Market Cap</span>
                  <span className="font-mono text-white font-semibold">{currentStock.marketCap}</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block mb-0.5">ROE</span>
                  <span className="font-mono text-white font-semibold">{currentStock.roe.toFixed(2)}%</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block mb-0.5">P/E Ratio (TTM)</span>
                  <span className="font-mono text-white font-semibold">{currentStock.peRatio.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block mb-0.5">EPS (TTM)</span>
                  <span className="font-mono text-white font-semibold">${currentStock.eps.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block mb-0.5">P/B Ratio</span>
                  <span className="font-mono text-white font-semibold">{currentStock.pbRatio.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block mb-0.5">Dividend Yield</span>
                  <span className="font-mono text-white font-semibold">{currentStock.divYield.toFixed(2)}%</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block mb-0.5">Industry P/E</span>
                  <span className="font-mono text-white font-semibold">{currentStock.industryPe.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[#8B949E] block mb-0.5">Book Value</span>
                  <span className="font-mono text-white font-semibold">${currentStock.bookValue.toFixed(2)}</span>
                </div>
              </div>

              {/* Solana Onchain Primitives info */}
              <div className="mt-4 pt-3 border-t border-[#262A34] text-xs space-y-2">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-[#8B949E]">Solana SPL Token Mint</span>
                  <span className="font-mono text-white bg-[#121212] px-2 py-0.5 rounded border border-[#262A34] truncate max-w-xs">
                    {currentStock.mintAddress}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-[#8B949E]">Pyth Price Feed ID</span>
                  <span className="font-mono text-[#00D09C] bg-[#121212] px-2 py-0.5 rounded border border-[#262A34] truncate max-w-xs">
                    {currentStock.pythFeedId.slice(0, 16)}...
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Financial Performance Quarterly Chart matching Groww Screenshot 2026-09-12 132625.png */}
          {!isBasket && currentStock && (
            <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Financial performance</h3>
                <div className="flex items-center gap-1 bg-[#121212] p-1 rounded-lg border border-[#262A34] text-xs">
                  <span className="px-2 py-0.5 rounded bg-[#262A34] text-white font-medium">Quarterly</span>
                  <span className="px-2 py-0.5 rounded text-[#8B949E]">Yearly</span>
                </div>
              </div>

              <div className="h-44 flex items-end justify-between gap-4 pt-4 px-2">
                {currentStock.quarterly.map((q) => (
                  <div key={q.quarter} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex items-end justify-center gap-1.5 h-32">
                      {/* Revenue Bar */}
                      <div
                        className="w-1/2 max-w-[28px] bg-slate-400/70 hover:bg-slate-300 rounded-t transition"
                        style={{ height: `${Math.min(100, (q.revenue / 32000) * 100)}%` }}
                        title={`Revenue: $${q.revenue}M`}
                      />
                      {/* Profit Bar */}
                      <div
                        className="w-1/2 max-w-[28px] bg-[#00D09C] hover:bg-[#00e2ab] rounded-t transition"
                        style={{ height: `${Math.min(100, (q.profit / 18000) * 100)}%` }}
                        title={`Profit: $${q.profit}M`}
                      />
                    </div>
                    <span className="text-[11px] text-[#8B949E] font-medium">{q.quarter}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center gap-6 pt-2 border-t border-[#262A34] text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-slate-400/70" />
                  <span className="text-[#8B949E]">Revenue ($M)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-[#00D09C]" />
                  <span className="text-[#8B949E]">Profit ($M)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Constituents tab if Basket */}
      {activeTab === 'Constituents' && isBasket && (
        <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-white">Basket Constituents ({basket.assetsCount})</h3>
          <div className="divide-y divide-[#262A34]">
            {basket.constituents.map((item) => (
              <div key={item.symbol} className="py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-white">{item.symbol}</span>
                  <span className="text-xs text-[#8B949E] block">{item.name}</span>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <span className="text-xs text-[#8B949E] block">Weight</span>
                    <span className="text-xs font-mono font-semibold text-white">{item.weight}%</span>
                  </div>
                  <div>
                    <span className="text-xs text-[#8B949E] block">Price</span>
                    <span className="text-xs font-mono font-semibold text-white">${item.price.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-[#8B949E] block">24h</span>
                    <span
                      className={`text-xs font-mono font-semibold ${
                        item.change24h >= 0 ? 'text-[#00D09C]' : 'text-[#EB5B5B]'
                      }`}
                    >
                      {item.change24h >= 0 ? '+' : ''}{item.change24h.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* News Tab */}
      {activeTab === 'News' && (
        <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-white">Latest Catalysts & Headlines</h3>
          <div className="divide-y divide-[#262A34]">
            {(!isBasket && currentStock ? currentStock.news : []).map((n, i) => (
              <div key={i} className="py-3">
                <div className="flex items-center justify-between text-[11px] text-[#8B949E] mb-1">
                  <span className="font-semibold text-white">{n.source}</span>
                  <span>{n.time}</span>
                </div>
                <p className="text-xs text-[#8B949E] leading-relaxed">{n.headline}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
