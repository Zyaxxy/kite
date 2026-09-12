'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Bell, RotateCcw, Wallet, ShieldCheck, ChevronDown, Check } from 'lucide-react';
import { usePaperTrading } from '../../lib/usePaperTrading';
import { PrivyAuthModal } from './PrivyAuthModal';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletButton } from '../WalletButton';

interface KiteHeaderProps {
  onOpenSearch: () => void;
  activeTab?: string;
  tradingMode: 'demo' | 'real';
  onToggleTradingMode: (mode: 'demo' | 'real') => void;
}

const TABS = [
  { label: 'Explore & Markets', href: '/markets' },
  { label: 'Thematic Baskets', href: '/baskets' },
  { label: 'Automated SIPs', href: '/sip' },
  { label: 'Portfolio & Positions', href: '/portfolio' },
];

export function KiteHeader({
  onOpenSearch,
  activeTab,
  tradingMode,
  onToggleTradingMode,
}: KiteHeaderProps) {
  const pathname = usePathname();
  const { cashBalance, reset } = usePaperTrading();
  const { connected, publicKey } = useWallet();
  const [privyModalOpen, setPrivyModalOpen] = useState(false);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [tickerPrices, setTickerPrices] = useState({
    sp500: { price: '$5,864.20', change: '+0.65%' },
    nasdaq: { price: '$18,420.10', change: '+1.12%' },
    btc: { price: '$64,280', change: '+2.40%' },
    sol: { price: '$154.20', change: '+4.80%' },
  });

  useEffect(() => {
    // Fetch live ticker benchmarks
    fetch('/api/quotes?symbols=SPY,QQQ,SOL-USD,BTC-USD')
      .then((r) => r.json())
      .then((d) => {
        if (d?.quotes) {
          const q = d.quotes;
          setTickerPrices({
            sp500: {
              price: q['SPY'] ? `$${(q['SPY'].price * 10).toFixed(2)}` : '$5,864.20',
              change: q['SPY'] ? `${q['SPY'].changePct >= 0 ? '+' : ''}${q['SPY'].changePct.toFixed(2)}%` : '+0.65%',
            },
            nasdaq: {
              price: q['QQQ'] ? `$${(q['QQQ'].price * 37.6).toFixed(2)}` : '$18,420.10',
              change: q['QQQ'] ? `${q['QQQ'].changePct >= 0 ? '+' : ''}${q['QQQ'].changePct.toFixed(2)}%` : '+1.12%',
            },
            btc: {
              price: q['BTC-USD'] ? `$${q['BTC-USD'].price.toLocaleString()}` : '$64,280',
              change: q['BTC-USD'] ? `${q['BTC-USD'].changePct >= 0 ? '+' : ''}${q['BTC-USD'].changePct.toFixed(2)}%` : '+2.40%',
            },
            sol: {
              price: q['SOL-USD'] ? `$${q['SOL-USD'].price.toFixed(2)}` : '$154.20',
              change: q['SOL-USD'] ? `${q['SOL-USD'].changePct >= 0 ? '+' : ''}${q['SOL-USD'].changePct.toFixed(2)}%` : '+4.80%',
            },
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border-subtle bg-surface-base/95 backdrop-blur-xl">
      {/* Live Global Macro Ticker Bar */}
      <div className="border-b border-border-subtle/50 bg-[#08090C] px-4 sm:px-8 py-1.5 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-text-muted">S&P 500</span>
            <span className="text-text-primary font-medium tabular-nums">{tickerPrices.sp500.price}</span>
            <span className="text-bull-green font-medium tabular-nums">{tickerPrices.sp500.change}</span>
          </div>
          <span className="text-white/10 shrink-0">•</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-text-muted">NASDAQ</span>
            <span className="text-text-primary font-medium tabular-nums">{tickerPrices.nasdaq.price}</span>
            <span className="text-bull-green font-medium tabular-nums">{tickerPrices.nasdaq.change}</span>
          </div>
          <span className="text-white/10 shrink-0">•</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-text-muted">BTC</span>
            <span className="text-text-primary font-medium tabular-nums">{tickerPrices.btc.price}</span>
            <span className="text-bull-green font-medium tabular-nums">{tickerPrices.btc.change}</span>
          </div>
          <span className="text-white/10 shrink-0">•</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-text-muted">SOL</span>
            <span className="text-text-primary font-medium tabular-nums">{tickerPrices.sol.price}</span>
            <span className="text-bull-green font-medium tabular-nums">{tickerPrices.sol.change}</span>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-4 text-[11px] font-mono text-text-muted">
          <span className="inline-flex items-center gap-1.5 text-bull-green font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-bull-green animate-pulse" />
            SPL Equity Pools Active
          </span>
          <span className="text-white/10">•</span>
          <span>Pyth Benchmark ±0.01%</span>
          <span className="text-white/10">•</span>
          <span>Avg Gas: &lt; 0.000005 SOL</span>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="px-4 sm:px-8 h-16 flex items-center justify-between gap-4 max-w-[1780px] mx-auto">
        {/* Left: Brand Identity + Navigation Tabs */}
        <div className="flex items-center gap-8 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 group">
            {/* High-Precision Geometric Kite Mark (No Emoji) */}
            <div className="w-8 h-8 rounded-lg bg-surface-card-elevated border border-border-interactive flex items-center justify-center text-bull-green group-hover:scale-105 transition-transform shadow-[0_0_12px_rgba(0,208,156,0.2)]">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 12l10 10 10-10L12 2z" />
                <path d="M12 2v20" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-display text-xl font-bold tracking-tight text-white group-hover:text-bull-green transition-colors">
                Kite
              </span>
              <span className="text-[9px] font-mono tracking-widest uppercase text-text-muted -mt-1">
                Equities Engine
              </span>
            </div>
          </Link>

          {/* Desktop Nav Tabs */}
          <nav className="hidden xl:flex items-center gap-1 text-sm font-medium">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-white hover:bg-surface-card transition-all flex items-center gap-1.5 mr-1"
            >
              Overview
            </Link>
            {TABS.map((tab) => {
              const isActive =
                activeTab === tab.href ||
                pathname === tab.href ||
                (tab.href === '/markets' && (pathname === '/app' || activeTab === '/app'));
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-2 text-xs font-semibold ${
                    isActive
                      ? 'bg-surface-overlay text-bull-green border border-bull-green/20 shadow-sm'
                      : 'text-text-secondary hover:text-white hover:bg-surface-card'
                  }`}
                >
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-bull-green" />}
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Center: Search Trigger (⌘K) */}
        <div className="relative hidden sm:block w-52 md:w-64">
          <button
            onClick={onOpenSearch}
            className="w-full flex items-center justify-between bg-surface-card border border-border-subtle hover:border-border-interactive rounded-lg px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-all"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <span>Search AAPL, NVDA...</span>
            </div>
            <kbd className="text-[10px] font-mono text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded border border-white/5">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: Trading Mode Switcher & Authentication */}
        <div className="flex items-center gap-2.5">
          {/* Trading Mode Dropdown Pill */}
          <div className="relative">
            <button
              onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-card border border-border-subtle hover:border-border-interactive transition-colors text-xs font-mono shadow-sm"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  tradingMode === 'demo'
                    ? 'bg-bull-green shadow-[0_0_8px_rgba(0,208,156,0.8)]'
                    : 'bg-accent-cyan shadow-[0_0_8px_rgba(56,189,248,0.8)]'
                }`}
              />
              <span className="font-semibold text-text-primary">
                {tradingMode === 'demo' ? 'Paper Demo' : 'Real Trading'}
              </span>
              <ChevronDown className="w-3 h-3 text-text-muted" />
            </button>

            {modeDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-64 bg-surface-card border border-border-interactive rounded-xl p-2 shadow-2xl z-50 space-y-1"
                onClick={() => setModeDropdownOpen(false)}
              >
                <button
                  onClick={() => onToggleTradingMode('demo')}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-lg text-left transition-colors ${
                    tradingMode === 'demo' ? 'bg-surface-overlay' : 'hover:bg-surface-card-elevated'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-bull-green mt-1 shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                      Paper Trading (Demo)
                      {tradingMode === 'demo' && <Check className="w-3 h-3 text-bull-green" />}
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Test 1-click baskets & SIPs with $50k paper USDC. No risk.
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => onToggleTradingMode('real')}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-lg text-left transition-colors ${
                    tradingMode === 'real' ? 'bg-surface-overlay' : 'hover:bg-surface-card-elevated'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-accent-cyan mt-1 shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                      Real Trading (Mainnet)
                      {tradingMode === 'real' && <Check className="w-3 h-3 text-accent-cyan" />}
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Sign in with Privy or Solana wallet for direct Jupiter swaps.
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Paper Trading Balance Indicator Pill & Reset */}
          {tradingMode === 'demo' ? (
            <div className="hidden sm:flex items-center gap-2 bg-surface-card-elevated border border-border-subtle px-3 py-1.5 rounded-full text-xs font-mono shadow-sm">
              <span className="text-text-muted text-[11px]">Paper USDC:</span>
              <span className="text-bull-green font-bold tabular-nums">
                ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <button
                onClick={() => reset()}
                title="Reset Paper Demo to $50,000"
                className="ml-1 p-1 rounded-full hover:bg-surface-overlay text-text-muted hover:text-white transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          ) : (
            /* Real Trading: Privy Sign In / Wallet Button Pill */
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPrivyModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface-card-elevated hover:bg-surface-overlay border border-border-interactive text-xs font-semibold text-text-primary transition-colors shadow-sm"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-bull-green" />
                <span>{connected ? 'Privy Active' : 'Sign in with Privy'}</span>
              </button>
              <div className="hidden md:block">
                <WalletButton />
              </div>
            </div>
          )}

          {/* Notifications Icon */}
          <button
            aria-label="Notifications"
            className="relative p-2 rounded-lg bg-surface-card border border-border-subtle text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-bull-green rounded-full ring-2 ring-surface-card" />
          </button>
        </div>
      </div>

      {/* Mobile Sub-Navigation Tabs */}
      <div className="xl:hidden overflow-x-auto border-t border-border-subtle/60 bg-surface-card/60 px-4 py-2 scrollbar-hide">
        <nav className="flex items-center gap-1 min-w-max">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.href || pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-surface-overlay text-bull-green border border-bull-green/30'
                    : 'text-text-secondary hover:text-white hover:bg-surface-card'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Privy Auth Modal */}
      <PrivyAuthModal isOpen={privyModalOpen} onClose={() => setPrivyModalOpen(false)} />
    </header>
  );
}
