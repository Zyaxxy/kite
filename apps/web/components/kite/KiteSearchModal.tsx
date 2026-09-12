'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CURATED_BASKETS } from '@kite/sdk';
import { Search, X, Layers, ArrowUpRight, Cpu } from 'lucide-react';

interface KiteSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStock: (symbol: string) => void;
  onSelectBasket: (basketId: string) => void;
}

const SEARCHABLE_STOCKS = [
  { symbol: 'NVDA', name: 'Nvidia Corporation', category: 'AI & Foundry' },
  { symbol: 'AAPL', name: 'Apple Inc.', category: 'Mega-Cap Tech' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', category: 'Mega-Cap Tech' },
  { symbol: 'TSLA', name: 'Tesla Inc.', category: 'Automotive & AI' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', category: 'E-Commerce & Cloud' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', category: 'Hyperscaler' },
  { symbol: 'META', name: 'Meta Platforms Inc.', category: 'Social & AI' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor Mfg.', category: 'AI & Foundry' },
  { symbol: 'ASML', name: 'ASML Holding N.V.', category: 'Lithography' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', category: 'Custom Silicon' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', category: 'Index ETFs' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', category: 'Index ETFs' },
  { symbol: 'OPENAI', name: 'OpenAI Pre-Stock', category: 'Pre-IPO Giants' },
  { symbol: 'SPACEX', name: 'SpaceX Pre-Stock', category: 'Pre-IPO Giants' },
  { symbol: 'STRIPE', name: 'Stripe Pre-Stock', category: 'Pre-IPO Giants' },
];

export function KiteSearchModal({
  isOpen,
  onClose,
  onSelectStock,
  onSelectBasket,
}: KiteSearchModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isOpen) onClose();
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  const filteredBaskets = CURATED_BASKETS.filter(
    (b) => b.name.toLowerCase().includes(q) || b.ticker.toLowerCase().includes(q)
  );

  const filteredStocks = SEARCHABLE_STOCKS.filter(
    (s) => s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q)
  );

  const hasResults = filteredBaskets.length > 0 || filteredStocks.length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex justify-center items-start pt-[12vh] px-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface-card border border-border-interactive rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Bar */}
        <div className="p-4 border-b border-border-subtle flex items-center gap-3 bg-surface-base/80">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-text-primary placeholder:text-text-muted text-xs font-sans"
            placeholder="Search NVDA, AAPL, Thematic Baskets (MAG7, AI-TITAN)..."
          />
          {query ? (
            <button onClick={() => setQuery('')} className="text-text-muted hover:text-white p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] text-text-muted bg-surface-overlay rounded border border-white/5 font-mono">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-3 space-y-4">
          {!hasResults && query && (
            <div className="py-10 text-center text-text-muted text-xs font-mono">
              No tokenized assets found for &ldquo;{query}&rdquo;
            </div>
          )}

          {filteredBaskets.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider mb-1">
                Thematic Baskets
              </div>
              <div className="space-y-1">
                {filteredBaskets.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => {
                      onSelectBasket(b.id);
                      onClose();
                    }}
                    className="p-2.5 rounded-xl hover:bg-surface-card-elevated border border-transparent hover:border-border-subtle flex items-center justify-between cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-surface-overlay border border-border-subtle flex items-center justify-center text-bull-green">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-display font-bold text-xs text-text-primary group-hover:text-bull-green transition-colors">
                          {b.name}
                        </div>
                        <span className="text-[10px] font-mono text-bull-green">{b.ticker}</span>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-text-muted group-hover:text-bull-green transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredStocks.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider mb-1">
                Tokenized US Equities
              </div>
              <div className="space-y-1">
                {filteredStocks.map((s) => (
                  <div
                    key={s.symbol}
                    onClick={() => {
                      onSelectStock(s.symbol);
                      onClose();
                    }}
                    className="p-2.5 rounded-xl hover:bg-surface-card-elevated border border-transparent hover:border-border-subtle flex items-center justify-between cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-surface-overlay border border-border-subtle flex items-center justify-center text-bull-green font-mono font-bold text-xs">
                        {s.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-display font-bold text-xs text-text-primary group-hover:text-bull-green transition-colors">
                          {s.name}
                        </div>
                        <span className="text-[10px] font-mono text-text-muted">
                          {s.symbol} • {s.category}
                        </span>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-text-muted group-hover:text-bull-green transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
