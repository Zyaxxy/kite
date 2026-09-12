'use client';

import React from 'react';
import { Rocket, ArrowRight } from 'lucide-react';

interface GrowwPositionsProps {
  onExploreMarkets: () => void;
}

export function GrowwPositions({ onExploreMarkets }: GrowwPositionsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white tracking-tight">Positions</h2>
      </div>

      {/* Empty state matching Groww Screenshot 2026-09-12 132524.png */}
      <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-12 text-center flex flex-col items-center justify-center min-h-[420px] shadow-xl">
        {/* Rocket illustration */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#00D09C]/10 via-blue-500/10 to-purple-500/10 flex items-center justify-center border border-white/5">
            <Rocket className="w-12 h-12 text-[#00D09C] -rotate-45" />
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00D09C] opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-[#00D09C]" />
          </span>
        </div>

        <h3 className="text-xl font-bold text-white">No open positions</h3>
        <p className="text-xs text-[#8B949E] mt-2 max-w-sm leading-relaxed">
          Equity intraday and MTF positions will appear here. All trades settle non-custodially in under 400ms on Solana.
        </p>

        <button
          onClick={onExploreMarkets}
          className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00D09C] hover:bg-[#00e2ab] text-[#0A261D] font-bold text-xs transition shadow-lg shadow-[#00D09C]/20"
        >
          <span>Explore Tokenized Stocks</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
