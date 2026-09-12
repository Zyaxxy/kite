'use client';

import React, { useState, useEffect } from 'react';
import { KiteHeader } from './KiteHeader';
import { KiteMarkets } from './KiteMarkets';
import { KiteBaskets } from './KiteBaskets';
import { KiteSIPs } from './KiteSIPs';
import { KitePortfolio } from './KitePortfolio';
import { KiteStockDetail } from './KiteStockDetail';
import { KiteBuyPanel } from './KiteBuyPanel';
import { KiteSearchModal } from './KiteSearchModal';
import { CURATED_BASKETS } from '@kite/sdk';
import type { QuoteData } from '../../lib/market-types';

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
  const [tradingMode, setTradingMode] = useState<'demo' | 'real'>('demo');
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});

  // Fetch real-time quotes on load and refresh every 25 seconds
  useEffect(() => {
    const loadQuotes = () => {
      fetch('/api/quotes')
        .then((r) => r.json())
        .then((d) => {
          if (d?.quotes) setQuotes(d.quotes);
        })
        .catch(() => {});
    };
    loadQuotes();
    const interval = setInterval(loadQuotes, 25000);
    return () => clearInterval(interval);
  }, []);

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

  // Determine active target for right-side execution dock
  let activeTargetName = 'AI Infrastructure Titans';
  let activeTargetSymbol = 'dAI-TITAN';
  let activeTargetPrice = 114.20;
  let activeTargetChange = 3.08;

  if (selectedSymbol) {
    if (isBasketSelected) {
      const b = CURATED_BASKETS.find((item) => item.id === selectedSymbol || item.ticker === selectedSymbol);
      if (b) {
        activeTargetName = b.name;
        activeTargetSymbol = b.ticker;
        activeTargetPrice = b.id === 'sol-ai-infra' ? 114.20 : b.id === 'sol-mag7' ? 248.50 : 185.00;
        activeTargetChange = 3.08;
      }
    } else {
      const raw = selectedSymbol.replace(/^x/, '').replace(/^pre/, '');
      const q = quotes[raw] || quotes[selectedSymbol];
      activeTargetName = q?.name || `${selectedSymbol} Equity`;
      activeTargetSymbol = selectedSymbol;
      activeTargetPrice = q?.price || 150.0;
      activeTargetChange = q?.changePct || 1.25;
    }
  }

  return (
    <div className="min-h-screen bg-surface-base text-text-primary flex flex-col font-sans selection:bg-bull-green/20 selection:text-bull-green">
      {/* Top Sticky Header */}
      <KiteHeader
        onOpenSearch={() => setSearchOpen(true)}
        tradingMode={tradingMode}
        onToggleTradingMode={setTradingMode}
        activeTab={
          activeTab === 'markets'
            ? '/markets'
            : activeTab === 'baskets'
            ? '/baskets'
            : activeTab === 'sip'
            ? '/sip'
            : '/portfolio'
        }
      />

      {/* Main Responsive Grid Layout (12 Columns: 8 analytical / 4 execution dock) */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Analytical Column (~68% on Desktop) */}
          <section className="lg:col-span-8 w-full min-w-0">
            {selectedSymbol ? (
              isBasketSelected ? (
                <KiteBaskets
                  onSelectBasket={handleSelectBasket}
                  selectedBasketId={selectedSymbol}
                  onBack={handleClearSelection}
                  quotes={quotes}
                />
              ) : (
                <KiteStockDetail
                  symbol={selectedSymbol}
                  isBasket={false}
                  onBack={handleClearSelection}
                  onCreateSIP={handleCreateSIP}
                  quotes={quotes}
                />
              )
            ) : activeTab === 'markets' ? (
              <KiteMarkets
                onSelectStock={handleSelectStock}
                onSelectBasket={handleSelectBasket}
                quotes={quotes}
              />
            ) : activeTab === 'baskets' ? (
              <KiteBaskets
                onSelectBasket={handleSelectBasket}
                quotes={quotes}
              />
            ) : activeTab === 'sip' ? (
              <KiteSIPs
                prefillSymbol={sipPrefill}
                quotes={quotes}
              />
            ) : (
              <KitePortfolio
                onSelectAsset={(sym, isBsk) => {
                  if (isBsk) handleSelectBasket(sym);
                  else handleSelectStock(sym);
                }}
                quotes={quotes}
              />
            )}
          </section>

          {/* Right Sticky Execution Dock (~32% on Desktop) */}
          <section className="lg:col-span-4 w-full">
            <KiteBuyPanel
              targetName={activeTargetName}
              targetSymbol={activeTargetSymbol}
              targetPrice={activeTargetPrice}
              targetChange={activeTargetChange}
              onClose={handleClearSelection}
              tradingMode={tradingMode}
            />
          </section>
        </div>
      </main>

      {/* Global ⌘K Search Modal */}
      <KiteSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectStock={handleSelectStock}
        onSelectBasket={handleSelectBasket}
      />
    </div>
  );
}
