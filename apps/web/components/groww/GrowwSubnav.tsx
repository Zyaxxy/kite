'use client';

import React from 'react';

interface GrowwSubnavProps {
  activeCategory: 'stocks' | 'baskets' | 'fno';
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export function GrowwSubnav({ activeCategory, activeTab, onSelectTab }: GrowwSubnavProps) {
  let tabs: { id: string; label: string }[] = [];

  if (activeCategory === 'stocks') {
    tabs = [
      { id: 'explore', label: 'Explore' },
      { id: 'holdings', label: 'Holdings' },
      { id: 'positions', label: 'Positions' },
      { id: 'orders', label: 'Orders' },
      { id: 'watchlist', label: 'Watchlist' }
    ];
  } else if (activeCategory === 'baskets') {
    tabs = [
      { id: 'explore', label: 'Explore' },
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'sip', label: 'SIPs' },
      { id: 'watchlist', label: 'Watchlist' }
    ];
  } else {
    tabs = [
      { id: 'explore', label: 'Explore' },
      { id: 'positions', label: 'Positions' },
      { id: 'orders', label: 'Orders' }
    ];
  }

  return (
    <div className="w-full bg-[#121212] border-b border-[#262A34] px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl flex items-center justify-between">
        <nav className="flex items-center space-x-6 sm:space-x-8 overflow-x-auto no-scrollbar" aria-label="Sub-navigation">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id || (activeTab === 'holdings' && tab.id === 'dashboard');
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`py-3.5 text-sm font-semibold whitespace-nowrap transition-colors relative ${
                  isActive ? 'text-white' : 'text-[#8B949E] hover:text-white'
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00D09C] rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
