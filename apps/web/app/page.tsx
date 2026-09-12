'use client';

import React, { useState } from 'react';
import { LandingPage } from '../components/landing/LandingPage';
import { GrowwApp } from '../components/groww/GrowwApp';
import { Sparkles, Terminal } from 'lucide-react';

export default function RootPage() {
  const [viewMode, setViewMode] = useState<'landing' | 'groww'>('landing');

  return (
    <div className="relative min-h-screen">
      {/* Floating Switcher Pill for paired review */}
      <div className="fixed bottom-5 right-5 z-50 bg-[#181A20]/90 backdrop-blur-md border border-white/20 p-1 rounded-full shadow-2xl flex items-center gap-1 text-xs">
        <button
          onClick={() => setViewMode('landing')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-semibold transition ${
            viewMode === 'landing'
              ? 'bg-[#D4F754] text-slate-950 shadow-md'
              : 'text-[#8B949E] hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Landing Page</span>
        </button>

        <button
          onClick={() => setViewMode('groww')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-semibold transition ${
            viewMode === 'groww'
              ? 'bg-[#00D09C] text-[#0A261D] shadow-md'
              : 'text-[#8B949E] hover:text-white'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Groww UI</span>
        </button>
      </div>

      {/* Render selected view */}
      {viewMode === 'landing' ? (
        <LandingPage onEnterApp={() => setViewMode('groww')} />
      ) : (
        <GrowwApp />
      )}
    </div>
  );
}
