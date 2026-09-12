'use client';

import React, { useState } from 'react';
import { GrowwHeader } from './GrowwHeader';
import { GrowwTicker } from './GrowwTicker';
import { GrowwSubnav } from './GrowwSubnav';
import { GrowwExplore } from './GrowwExplore';
import { GrowwHoldings } from './GrowwHoldings';
import { GrowwSIPs } from './GrowwSIPs';
import { GrowwPositions } from './GrowwPositions';
import { GrowwStockDetail } from './GrowwStockDetail';
import { GrowwSidebar } from './GrowwSidebar';
import { GrowwSearchModal } from './GrowwSearchModal';
import { StockItem, BasketItem, GROWW_STOCKS, POPULAR_BASKETS } from '../../lib/groww-data';

interface GrowwAppProps {
  initialTab?: string;
  initialCategory?: 'stocks' | 'baskets' | 'fno';
  initialSymbol?: string;
}

export function GrowwApp({
  initialTab = 'explore',
  initialCategory = 'stocks',
  initialSymbol
}: GrowwAppProps) {
  const [activeCategory, setActiveCategory] = useState<'stocks' | 'baskets' | 'fno'>(initialCategory);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(
    initialSymbol ? GROWW_STOCKS[initialSymbol.toUpperCase()] || null : null
  );
  const [selectedBasket, setSelectedBasket] = useState<BasketItem | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [terminalMode, setTerminalMode] = useState(false);
  const [cartCount, setCartCount] = useState(2);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

  const handleSelectCategory = (cat: 'stocks' | 'baskets' | 'fno') => {
    setActiveCategory(cat);
    setSelectedStock(null);
    setSelectedBasket(null);
    if (cat === 'baskets') {
      setActiveTab('explore');
    } else {
      setActiveTab('explore');
    }
  };

  const handleSelectStock = (stock: StockItem) => {
    setSelectedStock(stock);
    setSelectedBasket(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectBasket = (basket: BasketItem) => {
    setSelectedBasket(basket);
    setSelectedStock(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearSelection = () => {
    setSelectedStock(null);
    setSelectedBasket(null);
  };

  const handleCreateSIPForSymbol = (symbol: string) => {
    setActiveCategory('baskets');
    setActiveTab('sip');
    setSelectedStock(null);
    setSelectedBasket(null);
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex flex-col font-sans">
      {/* Top Universal Groww Header */}
      <GrowwHeader
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
        onOpenSearch={() => setSearchOpen(true)}
        terminalMode={terminalMode}
        onToggleTerminal={() => setTerminalMode(!terminalMode)}
        onOpenCart={() => setCartDrawerOpen(true)}
        cartCount={cartCount}
      />

      {/* Live Market Index Ticker Strip */}
      <GrowwTicker
        terminalMode={terminalMode}
        onToggleTerminal={() => setTerminalMode(!terminalMode)}
      />

      {/* Category Sub-tabs: Explore, Holdings, Positions, etc. */}
      <GrowwSubnav
        activeCategory={activeCategory}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setSelectedStock(null);
          setSelectedBasket(null);
        }}
      />

      {/* Main Two-Column Groww Layout */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Left Content Area (~68% on Desktop) */}
          <section className="lg:col-span-8 w-full">
            {/* If a stock or basket is selected, render Detail View */}
            {selectedStock || selectedBasket ? (
              <GrowwStockDetail
                stock={selectedStock}
                basket={selectedBasket}
                onBack={handleClearSelection}
                onSelectStock={handleSelectStock}
                onCreateSIP={handleCreateSIPForSymbol}
              />
            ) : activeTab === 'explore' ? (
              <GrowwExplore
                onSelectStock={handleSelectStock}
                onSelectBasket={handleSelectBasket}
                onViewAllBaskets={() => {
                  setActiveCategory('baskets');
                  setActiveTab('explore');
                }}
              />
            ) : activeTab === 'holdings' || activeTab === 'dashboard' ? (
              <GrowwHoldings
                onSelectHolding={(st, bk) => {
                  if (st) handleSelectStock(st);
                  if (bk) handleSelectBasket(bk);
                }}
              />
            ) : activeTab === 'sip' ? (
              <GrowwSIPs onStartNewSIP={() => {}} />
            ) : activeTab === 'positions' ? (
              <GrowwPositions onExploreMarkets={() => setActiveTab('explore')} />
            ) : activeTab === 'orders' ? (
              <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-6 shadow-xl space-y-4">
                <h2 className="text-lg font-bold text-white">Executed Orders</h2>
                <div className="divide-y divide-[#262A34] text-xs">
                  <div className="py-3 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-white block">BUY SOL-MAG7 Basket</span>
                      <span className="text-[#8B949E]">10 units @ $248.50 • Jupiter Solana</span>
                    </div>
                    <span className="text-[#00D09C] font-mono font-bold">COMPLETED</span>
                  </div>
                  <div className="py-3 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-white block">SIP Recurring NVDAx</span>
                      <span className="text-[#8B949E]">4.01 units @ $124.50 • Automated DCA</span>
                    </div>
                    <span className="text-[#00D09C] font-mono font-bold">COMPLETED</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-8 text-center text-[#8B949E] text-xs">
                Your Watchlist is ready. Add any tokenized stock or basket using the bookmark button.
              </div>
            )}
          </section>

          {/* Right Sticky Sidebar (~32% on Desktop) */}
          <div className="lg:col-span-4 w-full">
            <GrowwSidebar
              selectedStock={selectedStock}
              selectedBasket={selectedBasket}
              onClearSelection={handleClearSelection}
              onSelectStock={handleSelectStock}
              onSelectBasket={handleSelectBasket}
              activeTab={activeTab}
            />
          </div>
        </div>
      </main>

      {/* Global Search Modal (Ctrl+K) */}
      <GrowwSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectStock={handleSelectStock}
        onSelectBasket={handleSelectBasket}
      />

      {/* Cart Drawer */}
      {cartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-[#181A20] border-l border-[#262A34] h-full p-6 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#262A34]">
                <h3 className="text-base font-bold text-white">Investment Cart (2)</h3>
                <button
                  onClick={() => setCartDrawerOpen(false)}
                  className="text-xs text-[#8B949E] hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-[#121212] border border-[#262A34] flex justify-between items-center">
                  <div>
                    <span className="font-bold text-white block">SOL-MAG7 Basket</span>
                    <span className="text-[#8B949E]">1 Basket • $248.50</span>
                  </div>
                  <span className="font-mono text-white font-bold">$248.50</span>
                </div>
                <div className="p-3 rounded-lg bg-[#121212] border border-[#262A34] flex justify-between items-center">
                  <div>
                    <span className="font-bold text-white block">Nvidia Corp. Token (NVDAx)</span>
                    <span className="text-[#8B949E]">2 Tokens • $124.50</span>
                  </div>
                  <span className="font-mono text-white font-bold">$249.00</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#262A34] space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-[#8B949E]">Total Required</span>
                <span className="font-mono font-bold text-white">$497.50 USDC</span>
              </div>
              <button
                onClick={() => {
                  alert('Executing 1-click batch checkout on Solana via Jupiter!');
                  setCartDrawerOpen(false);
                }}
                className="w-full py-3 rounded-lg bg-[#00D09C] hover:bg-[#00e2ab] text-[#0A261D] font-bold text-xs transition"
              >
                1-Click Solana Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
