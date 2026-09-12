'use client';

import React, { useState, useEffect, useRef } from 'react';
import { KITE_STOCKS, KITE_BASKETS } from '../../lib/kite-data';
import { Search, X, Layers, ArrowUpRight } from 'lucide-react';

interface KiteSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStock: (symbol: string) => void;
  onSelectBasket: (basketId: string) => void;
}

export function KiteSearchModal({ isOpen, onClose, onSelectStock, onSelectBasket }: KiteSearchModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey))) {
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

  const filteredBaskets = KITE_BASKETS.filter(
    (b) => b.name.toLowerCase().includes(q) || b.ticker.toLowerCase().includes(q)
  );

  const filteredStocks = KITE_STOCKS.filter(
    (s) => s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q)
  );

  const hasResults = filteredBaskets.length > 0 || filteredStocks.length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex justify-center items-start pt-[12vh] px-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-raised border border-line rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Bar */}
        <div className="p-4 border-b border-line flex items-center gap-3 bg-bg/50">
          <Search className="w-5 h-5 text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-ink placeholder:text-muted text-sm"
            placeholder="Search tokenized equities, thematic baskets..."
          />
          {query ? (
            <button onClick={() => setQuery('')} className="text-muted hover:text-ink p-1">
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] text-muted bg-bg rounded border border-line font-mono">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-3 space-y-4">
          {!hasResults && query && (
            <div className="py-8 text-center text-muted text-xs">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {filteredBaskets.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
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
                    className="p-2.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-bg border border-line flex items-center justify-center font-mono text-xs font-bold text-ink">
                        {b.ticker.slice(0, 3)}
                      </div>
                      <div>
                        <span className="font-bold text-xs text-ink group-hover:text-accent transition-colors block">
                          {b.name}
                        </span>
                        <span className="text-[11px] text-muted font-mono">{b.ticker} · {b.assets.length} Assets</span>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted group-hover:text-ink transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredStocks.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
                Tokenized US Stocks
              </div>
              <div className="space-y-1">
                {filteredStocks.map((s) => (
                  <div
                    key={s.symbol}
                    onClick={() => {
                      onSelectStock(s.symbol);
                      onClose();
                    }}
                    className="p-2.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-bg border border-line flex items-center justify-center font-mono text-xs font-bold text-ink">
                        {s.symbol.slice(0, 3)}
                      </div>
                      <div>
                        <span className="font-bold text-xs text-ink group-hover:text-accent transition-colors block">
                          {s.name}
                        </span>
                        <span className="text-[11px] text-muted font-mono">{s.symbol} · {s.category}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-bold text-ink">${s.price.toFixed(2)}</div>
                      <div className={`font-mono text-[10px] ${s.change24h >= 0 ? 'text-up' : 'text-down'}`}>
                        {s.change24h >= 0 ? '+' : ''}{s.change24h.toFixed(2)}%
                      </div>
                    </div>
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
