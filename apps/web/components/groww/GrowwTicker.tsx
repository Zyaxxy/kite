'use client';

import React from 'react';
import { GROWW_INDICES } from '../../lib/groww-data';
import { SlidersHorizontal, Globe } from 'lucide-react';

interface GrowwTickerProps {
  onToggleTerminal?: () => void;
  terminalMode?: boolean;
}

export function GrowwTicker({ onToggleTerminal, terminalMode }: GrowwTickerProps) {
  return (
    <div className="w-full bg-[#121212] border-b border-[#262A34] px-4 sm:px-6 lg:px-8 py-2 text-xs select-none">
      <div className="mx-auto max-w-7xl flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
        <div className="flex items-center space-x-6 sm:space-x-8 shrink-0">
          {GROWW_INDICES.map((idx) => {
            return (
              <div key={idx.name} className="flex items-baseline space-x-2 shrink-0">
                <span className="font-semibold text-[#8B949E] tracking-tight">{idx.name}</span>
                <span className="font-medium text-white tabular-nums">{idx.value}</span>
                <span
                  className={`tabular-nums font-semibold ${
                    idx.up ? 'text-[#00D09C]' : 'text-[#EB5B5B]'
                  }`}
                >
                  {idx.change > 0 ? `+${idx.change.toFixed(2)}` : idx.change.toFixed(2)} ({idx.percent > 0 ? `+${idx.percent.toFixed(2)}` : idx.percent.toFixed(2)}%)
                </span>
              </div>
            );
          })}
        </div>

        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleTerminal}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border transition ${
              terminalMode
                ? 'bg-[#00D09C]/20 text-[#00D09C] border-[#00D09C]/40'
                : 'bg-[#181A20] text-[#8B949E] border-[#262A34] hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Terminal</span>
          </button>
          <div className="p-1 rounded bg-[#181A20] border border-[#262A34] text-[#8B949E] hover:text-white cursor-pointer">
            <Globe className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
