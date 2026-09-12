'use client';

import React, { useState } from 'react';
import { KiteHeader } from './KiteHeader';
import { KiteMarkets } from './KiteMarkets';
import { KiteBaskets } from './KiteBaskets';
import { KiteSIPs } from './KiteSIPs';
import { KitePortfolio } from './KitePortfolio';
import { KiteStockDetail } from './KiteStockDetail';
import { KiteBuyPanel } from './KiteBuyPanel';
import { KiteSearchModal } from './KiteSearchModal';
import { KITE_STOCKS_MAP, KITE_BASKETS, KiteStock } from '../../lib/kite-data';
import { ThematicBasket } from '@kite/sdk';

interface KiteAppProps {
  initialTab?: 'markets' | 'baskets' | 'sip' | 'portfolio';
  initialSymbol?: string;
  initialIsBasket?: boolean;
}

export function KiteApp({
  initialTab = 'markets',
  initialSymbol,
  initialIsBasket = false,
}: KiteAppProps) {
  const [activeTab, setActiveTab] = useState<'markets' | 'baskets' | 'sip' | 'portfolio'>(initialTab);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(initialSymbol || null);
  const [isBasketSelected, setIsBasketSelected] = useState<boolean>(initialIsBasket);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sipPrefill, setSipPrefill] = useState<string | undefined>(undefined);

  const handleSelectStock = (symbol: string) => {
    setSelectedSymbol(symbol);
    setIsBasketSelected(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectBasket = (basketId: string) => {
    setSelectedSymbol(basketId);
    setIsBasketSelected(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearSelection = () => {
    setSelectedSymbol(null);
  };

  const handleCreateSIP = (symbol: string) => {
    setSipPrefill(symbol);
    setSelectedSymbol(null);
    setActiveTab('sip');
  };

  // Resolve active item for the right-side Buy/Mint panel
  let activeTargetName: string | undefined;
  let activeTargetSymbol: string | undefined;
  let activeTargetPrice: number | undefined;
  let activeTargetChange: number | undefined;

  if (selectedSymbol) {
    if (isBasketSelected) {
      const basket = KITE_BASKETS.find((b) => b.id === selectedSymbol || b.ticker === selectedSymbol);
      if (basket) {
        activeTargetName = basket.name;
        activeTargetSymbol = basket.ticker;
        activeTargetPrice = 248.5; // Benchmark basket NAV
        activeTargetChange = 1.42;
      }
    } else {
      const stock = KITE_STOCKS_MAP[selectedSymbol];
      if (stock) {
        activeTargetName = stock.name;
        activeTargetSymbol = stock.symbol;
        activeTargetPrice = stock.price;
        activeTargetChange = stock.change24h;
      }
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col font-sans">
      {/* Top Kite Header */}
      <KiteHeader
        onOpenSearch={() => setSearchOpen(true)}
        activeTab={
          activeTab === 'markets'
            ? '/'
            : activeTab === 'baskets'
            ? '/baskets'
            : activeTab === 'sip'
            ? '/sip'
            : '/portfolio'
        }
      />

      {/* Main Container */}
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Primary Main Content (~68%) */}
          <section className="lg:col-span-8 w-full">
            {selectedSymbol ? (
              <KiteStockDetail
                symbol={selectedSymbol}
                isBasket={isBasketSelected}
                onBack={handleClearSelection}
                onCreateSIP={handleCreateSIP}
              />
            ) : activeTab === 'markets' ? (
              <KiteMarkets
                onSelectStock={handleSelectStock}
                onSelectBasket={handleSelectBasket}
              />
            ) : activeTab === 'baskets' ? (
              <KiteBaskets onSelectBasket={handleSelectBasket} />
            ) : activeTab === 'sip' ? (
              <KiteSIPs prefillSymbol={sipPrefill} />
            ) : (
              <KitePortfolio
                onSelectAsset={(sym, isBsk) => {
                  if (isBsk) handleSelectBasket(sym);
                  else handleSelectStock(sym);
                }}
              />
            )}
          </section>

          {/* Right Sticky Minting / Order Panel (~32%) */}
          <section className="lg:col-span-4 w-full">
            <KiteBuyPanel
              targetName={activeTargetName}
              targetSymbol={activeTargetSymbol}
              targetPrice={activeTargetPrice}
              targetChange={activeTargetChange}
              onClose={handleClearSelection}
            />
          </section>
        </div>
      </main>

      {/* Global Search Modal (Ctrl+K) */}
      <KiteSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectStock={handleSelectStock}
        onSelectBasket={handleSelectBasket}
      />
    </div>
  );
}
