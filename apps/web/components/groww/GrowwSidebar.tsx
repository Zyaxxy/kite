'use client';

import React, { useState } from 'react';
import { StockItem, BasketItem } from '../../lib/groww-data';
import { Settings, ShieldCheck, Sparkles, TrendingUp, Layers, Zap, CheckCircle, ArrowUpRight } from 'lucide-react';

interface GrowwSidebarProps {
  selectedStock: StockItem | null;
  selectedBasket: BasketItem | null;
  onClearSelection: () => void;
  onSelectStock: (stock: StockItem) => void;
  onSelectBasket: (basket: BasketItem) => void;
  activeTab: string;
}

export function GrowwSidebar({
  selectedStock,
  selectedBasket,
  onClearSelection,
  activeTab
}: GrowwSidebarProps) {
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'Delivery' | 'Intraday' | 'MTF' | 'SIP'>('Delivery');
  const [qty, setQty] = useState<string>('1');
  const [priceType, setPriceType] = useState<'Market' | 'Limit'>('Market');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);

  // If a stock is selected
  const activeItemName = selectedStock?.name || selectedBasket?.name;
  const activeItemSymbol = selectedStock?.symbol || selectedBasket?.ticker;
  const activeItemPrice = selectedStock?.price || selectedBasket?.nav || 0;
  const activeItemChange = selectedStock?.change1d || selectedBasket?.change1d || 0;

  const currentQuantity = parseFloat(qty) || 0;
  const priceToUse = priceType === 'Limit' && parseFloat(limitPrice) > 0 ? parseFloat(limitPrice) : activeItemPrice;
  const totalAmount = currentQuantity * priceToUse;

  const handleExecuteOrder = () => {
    setIsSubmitting(true);
    setTxSuccess(null);
    setTimeout(() => {
      setIsSubmitting(false);
      setTxSuccess(
        `${orderSide} order executed: ${qty} ${activeItemSymbol} at $${priceToUse.toFixed(2)} (${orderType} on Solana)`
      );
      setTimeout(() => setTxSuccess(null), 5000);
    }, 1200);
  };

  // If viewing a stock or basket or explicitly in trade mode
  if (selectedStock || selectedBasket) {
    return (
      <aside className="w-full bg-[#181A20] border border-[#262A34] rounded-xl p-5 sticky top-24 shadow-xl">
        <div className="flex items-start justify-between pb-3 border-b border-[#262A34]">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>{activeItemName}</span>
            </h3>
            <p className="text-xs text-[#8B949E] mt-0.5">
              {activeItemSymbol} • Solana SPL • ${activeItemPrice.toFixed(2)}{' '}
              <span className={activeItemChange >= 0 ? 'text-[#00D09C]' : 'text-[#EB5B5B]'}>
                ({activeItemChange >= 0 ? '+' : ''}{activeItemChange.toFixed(2)}%)
              </span>
            </p>
          </div>
          <button
            onClick={onClearSelection}
            className="text-xs text-[#8B949E] hover:text-white px-2 py-1 rounded hover:bg-[#262A34]"
          >
            ✕
          </button>
        </div>

        {/* BUY / SELL Tabs matching Groww */}
        <div className="flex mt-4 border-b border-[#262A34]">
          <button
            onClick={() => setOrderSide('BUY')}
            className={`flex-1 py-2 text-sm font-bold transition-all relative ${
              orderSide === 'BUY'
                ? 'text-[#00D09C] border-b-2 border-[#00D09C]'
                : 'text-[#8B949E] hover:text-white'
            }`}
          >
            BUY
          </button>
          <button
            onClick={() => setOrderSide('SELL')}
            className={`flex-1 py-2 text-sm font-bold transition-all relative ${
              orderSide === 'SELL'
                ? 'text-[#EB5B5B] border-b-2 border-[#EB5B5B]'
                : 'text-[#8B949E] hover:text-white'
            }`}
          >
            SELL
          </button>
        </div>

        {/* Order Sub-types: Delivery, Intraday, MTF, SIP */}
        <div className="flex items-center justify-between gap-1 mt-4">
          <div className="flex gap-1.5 flex-wrap">
            {(['Delivery', 'Intraday', 'MTF', 'SIP'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setOrderType(type)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                  orderType === type
                    ? 'bg-[#262A34] text-white'
                    : 'bg-transparent text-[#8B949E] hover:text-white'
                }`}
              >
                {type === 'MTF' ? 'MTF 3.69x' : type}
              </button>
            ))}
          </div>
          <button className="text-[#8B949E] hover:text-white p-1 rounded hover:bg-[#262A34]" title="Settings">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Inputs */}
        <div className="mt-5 space-y-4">
          <div>
            <div className="flex justify-between text-xs text-[#8B949E] mb-1.5">
              <span>Qty Solana / SPL</span>
              <span className="font-mono text-white">Avail: 100 USDC</span>
            </div>
            <input
              type="number"
              min="0.1"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full bg-[#121212] border border-[#262A34] rounded-lg px-3.5 py-2 text-sm text-white font-mono focus:border-[#00D09C] focus:outline-none"
              placeholder="Quantity"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-[#8B949E] mb-1.5">
              <span>Price ({priceType})</span>
              <div className="flex gap-2 text-[11px]">
                <button
                  onClick={() => setPriceType('Market')}
                  className={priceType === 'Market' ? 'text-[#00D09C] font-bold' : 'text-[#8B949E]'}
                >
                  Market
                </button>
                <span>|</span>
                <button
                  onClick={() => {
                    setPriceType('Limit');
                    if (!limitPrice) setLimitPrice(activeItemPrice.toFixed(2));
                  }}
                  className={priceType === 'Limit' ? 'text-[#00D09C] font-bold' : 'text-[#8B949E]'}
                >
                  Limit
                </button>
              </div>
            </div>
            <input
              type="number"
              disabled={priceType === 'Market'}
              value={priceType === 'Market' ? activeItemPrice.toFixed(2) : limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className={`w-full bg-[#121212] border border-[#262A34] rounded-lg px-3.5 py-2 text-sm font-mono focus:outline-none ${
                priceType === 'Market'
                  ? 'text-[#8B949E] cursor-not-allowed bg-[#181A20]'
                  : 'text-white focus:border-[#00D09C]'
              }`}
              placeholder="Price Limit"
            />
          </div>
        </div>

        {/* Balance & Approx Req matching Groww */}
        <div className="mt-6 pt-4 border-t border-[#262A34] flex items-center justify-between text-xs">
          <span className="text-[#8B949E]">Balance : ₹23.11 ($23.11)</span>
          <span className="text-white font-mono font-semibold">
            Approx req. : ${totalAmount.toFixed(2)}
          </span>
        </div>

        {/* Action Button */}
        <button
          onClick={handleExecuteOrder}
          disabled={isSubmitting || totalAmount <= 0}
          className={`w-full mt-4 py-3 rounded-lg font-bold text-sm transition shadow-lg ${
            orderSide === 'BUY'
              ? 'bg-[#00D09C] text-[#0A261D] hover:bg-[#00e2ab]'
              : 'bg-[#EB5B5B] text-white hover:bg-[#ff6b6b]'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Routing via Jupiter...
            </span>
          ) : (
            `${orderSide === 'BUY' ? 'Buy' : 'Sell'} ${activeItemSymbol}`
          )}
        </button>

        {txSuccess && (
          <div className="mt-3 p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 shrink-0 text-[#00D09C]" />
            <span>{txSuccess}</span>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-[#262A34] flex items-center justify-between text-[11px] text-[#8B949E]">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00D09C]" /> Non-custodial PDA
          </span>
          <span className="flex items-center gap-1 font-mono">
            <Zap className="w-3 h-3 text-amber-400" /> 0% gas fee
          </span>
        </div>
      </aside>
    );
  }

  // If on Holdings tab and no item is selected (Matching Screenshot 2026-09-11 203303.png)
  if (activeTab === 'holdings' || activeTab === 'dashboard') {
    return (
      <aside className="w-full bg-[#181A20] border border-[#262A34] rounded-xl p-6 text-center sticky top-24 flex flex-col items-center justify-center min-h-[380px]">
        {/* 3-bar illustration matching Groww screenshot */}
        <div className="w-32 space-y-2 mb-6 opacity-80">
          <div className="h-4 w-20 bg-white/20 rounded-md mx-auto" />
          <div className="h-6 w-28 bg-[#00D09C]/80 rounded-md mx-auto shadow-lg shadow-[#00D09C]/20" />
          <div className="h-4 w-20 bg-white/20 rounded-md mx-auto" />
        </div>
        <h4 className="text-sm font-semibold text-white">Select a fund to view investing options</h4>
        <p className="text-xs text-[#8B949E] mt-1 max-w-xs">
          Click any stock or thematic basket in your portfolio to manage SIPs, add units, or redeem.
        </p>
      </aside>
    );
  }

  // Default Sidebar (Matching Screenshot 2026-09-11 203251.png & Screenshot 2026-09-12 132515.png)
  return (
    <aside className="w-full space-y-6 sticky top-24">
      {/* "Your Investments" Card */}
      <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-5 shadow-lg">
        <h3 className="text-sm font-bold text-white mb-4">Your Investments</h3>

        <div className="space-y-4">
          <div>
            <span className="text-xs text-[#8B949E] block mb-1">Current</span>
            <span className="text-2xl font-bold text-white font-mono">₹25,135</span>
            <span className="text-xs text-[#8B949E] ml-2">($25,135)</span>
          </div>

          <div className="border-t border-[#262A34] pt-3 space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[#8B949E]">1D returns</span>
              <span className="font-semibold text-[#00D09C] font-mono">+₹30.39 (0.12%)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#8B949E]">Total returns</span>
              <span className="font-semibold text-[#00D09C] font-mono">+₹1,631 (6.94%)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#8B949E]">Invested</span>
              <span className="font-medium text-white font-mono">₹23,504</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#8B949E]">XIRR</span>
              <span className="font-semibold text-white font-mono">6.13%</span>
            </div>
          </div>
        </div>
      </div>

      {/* "Products and Tools" Card */}
      <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-5 shadow-lg">
        <h3 className="text-sm font-bold text-white mb-3">Products and Tools</h3>

        <div className="space-y-1">
          <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[#262A34]/50 cursor-pointer transition">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-emerald-500/20 text-[#00D09C]">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white">Pre-IPO Stocks</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-[#00D09C]/20 text-[#00D09C] text-[10px] font-bold">
              3 open
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[#262A34]/50 cursor-pointer transition">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-blue-500/20 text-blue-400">
                <Layers className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white">Thematic Baskets</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold">
              4 active
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[#262A34]/50 cursor-pointer transition">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-purple-500/20 text-purple-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white">Non-Custodial SIP</span>
            </div>
            <span className="text-[11px] text-[#8B949E]">0% fee</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[#262A34]/50 cursor-pointer transition">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-400">
                <Zap className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white">Pyth Price Oracles</span>
            </div>
            <span className="text-[11px] text-emerald-400 font-mono">Synced</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
