'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { Mark } from '../Mark';
import { FaucetButton } from '../FaucetButton';
import { WalletButton } from '../WalletButton';

interface KiteHeaderProps {
  onOpenSearch: () => void;
  activeTab?: string;
}

const TABS = [
  { label: 'Markets', href: '/' },
  { label: 'Baskets', href: '/baskets' },
  { label: 'SIPs', href: '/sip' },
  { label: 'Portfolio', href: '/portfolio' },
];

export function KiteHeader({ onOpenSearch, activeTab }: KiteHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Mark className="w-6 h-6 text-accent" />
            <span className="font-bold text-ink text-lg tracking-tight">Kite</span>
          </Link>

          {/* Center: Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.href || pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'text-ink bg-raised'
                      : 'text-muted hover:text-ink hover:bg-raised/50'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Devnet Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-raised border border-line text-xs font-medium text-muted">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Devnet
          </div>

          <FaucetButton />

          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-line bg-raised text-muted hover:text-ink hover:border-muted transition-colors text-sm"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 bg-bg border border-line rounded text-[10px] font-mono">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>

          <WalletButton />
        </div>
      </div>

      {/* Mobile Nav */}
      <div className="md:hidden overflow-x-auto border-t border-line bg-bg scrollbar-hide">
        <nav className="flex items-center px-4 h-12 min-w-max gap-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.href || pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'text-ink bg-raised'
                    : 'text-muted hover:text-ink hover:bg-raised/50'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
