'use client';

import React, { useState, useEffect } from 'react';
import { Search, X, TrendingUp, Layers, ChevronRight } from 'lucide-react';
import { GROWW_STOCKS, POPULAR_BASKETS, StockItem, BasketItem } from '../../lib/groww-data';

interface GrowwSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStock: (stock: StockItem) => void;
  onSelectBasket: (basket: BasketItem) => void;
}

export function GrowwSearchModal({
  isOpen,
  onClose,
  onSelectStock,
  onSelectBasket
}: GrowwSearchModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // toggle modal
        if (isOpen) onClose();
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const stockList = Object.values(GROWW_STOCKS);
  const filteredStocks = stockList.filter(
    (s) =>
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.name.toLowerCase().includes(query.toLowerCase())
  );
  const filteredBaskets = POPULAR_BASKETS.filter(
    (b) =>
      b.name.toLowerCase().includes(query.toLowerCase()) ||
      b.ticker.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 backdrop-blur-md pt-20 p-4 animate-in fade-in">
      <div className="w-full max-w-2xl bg-[#181A20] border border-[#262A34] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-[#262A34] bg-[#14161C]">
          <Search className="w-5 h-5 text-[#8B949E] mr-3 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stocks, thematic baskets, Pyth feeds..."
            className="w-full bg-transparent text-sm text-white placeholder-[#8B949E] focus:outline-none"
          />
          {query ? (
            <button onClick={() => setQuery('')} className="text-[#8B949E] hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="text-[11px] font-mono text-[#8B949E] bg-[#262A34] px-2 py-0.5 rounded">
              ESC
            </kbd>
          )}
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-4 space-y-4">
          {/* Baskets Group */}
          {filteredBaskets.length > 0 && (
            <div>
              <span className="text-[11px] font-bold text-[#8B949E] uppercase tracking-wider block mb-2">
                Thematic Baskets
              </span>
              <div className="space-y-1">
                {filteredBaskets.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => {
                      onSelectBasket(b);
                      onClose();
                    }}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#262A34]/60 cursor-pointer transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-[#262A34] flex items-center justify-center text-base">
                        {b.icon}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white group-hover:text-[#00D09C] transition-colors">
                          {b.name}
                        </span>
                        <span className="text-[11px] text-[#8B949E] block">
                          {b.ticker} • {b.assetsCount} assets • {b.tag}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#00D09C]">
                        +{b.return3Y.toFixed(1)}% 3Y
                      </span>
                      <ChevronRight className="w-4 h-4 text-[#8B949E] group-hover:text-white" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stocks Group */}
          {filteredStocks.length > 0 && (
            <div>
              <span className="text-[11px] font-bold text-[#8B949E] uppercase tracking-wider block mb-2">
                Tokenized US Stocks
              </span>
              <div className="space-y-1">
                {filteredStocks.map((s) => (
                  <div
                    key={s.symbol}
                    onClick={() => {
                      onSelectStock(s);
                      onClose();
                    }}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#262A34]/60 cursor-pointer transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-[#262A34] flex items-center justify-center text-xs font-bold text-white">
                        {s.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white group-hover:text-[#00D09C] transition-colors">
                          {s.name}
                        </span>
                        <span className="text-[11px] text-[#8B949E] block">
                          {s.symbol} • {s.category}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <span className="text-xs font-mono font-bold text-white">
                        ${s.price.toFixed(2)}
                      </span>
                      <span
                        className={`text-xs font-mono font-semibold ${
                          s.change1d >= 0 ? 'text-[#00D09C]' : 'text-[#EB5B5B]'
                        }`}
                      >
                        {s.change1d >= 0 ? '+' : ''}
                        {s.change1d.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredStocks.length === 0 && filteredBaskets.length === 0 && (
            <div className="py-8 text-center text-[#8B949E] text-xs">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
