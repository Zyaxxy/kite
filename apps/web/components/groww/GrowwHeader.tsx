'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, Bell, ShoppingBag, Moon, Sun, Settings, ExternalLink, HelpCircle, FileText, ChevronRight, CheckCircle2, Wallet } from 'lucide-react';
import { Mark } from '../Mark';
import { FaucetButton } from '../FaucetButton';
import { WalletButton } from '../WalletButton';
import { USER_NOTIFICATIONS } from '../../lib/groww-data';

interface GrowwHeaderProps {
  activeCategory: 'stocks' | 'baskets' | 'fno';
  onSelectCategory: (cat: 'stocks' | 'baskets' | 'fno') => void;
  onOpenSearch: () => void;
  terminalMode: boolean;
  onToggleTerminal: () => void;
  onOpenCart?: () => void;
  cartCount?: number;
}

export function GrowwHeader({
  activeCategory,
  onSelectCategory,
  onOpenSearch,
  terminalMode,
  onToggleTerminal,
  onOpenCart,
  cartCount = 2
}: GrowwHeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(3);

  return (
    <header className="sticky top-0 z-50 bg-[#121212] border-b border-[#262A34] text-white select-none">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Left: Logo & Category Tabs */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-[#00D09C] to-[#00B0FF] p-[2px] flex items-center justify-center shadow-lg shadow-[#00D09C]/20 group-hover:scale-105 transition-transform">
                <div className="h-full w-full rounded-full bg-[#121212] flex items-center justify-center">
                  <Mark className="h-5 w-5 text-[#00D09C]" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-white leading-tight">kite</span>
                <span className="text-[10px] text-[#8B949E] tracking-wider uppercase font-semibold">Solana Neo-Broker</span>
              </div>
            </Link>

            <Link
              href="/landing"
              className="hidden xl:inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#1F222A] text-[#8B949E] hover:text-[#00D09C] hover:border-[#00D09C]/40 border border-transparent transition"
            >
              <span>Landing</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          {/* Primary Tabs matching Groww */}
          <nav className="hidden md:flex items-center space-x-1" aria-label="Category tabs">
            <button
              onClick={() => onSelectCategory('stocks')}
              className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                activeCategory === 'stocks'
                  ? 'text-white border-b-2 border-[#00D09C] rounded-b-none'
                  : 'text-[#8B949E] hover:text-white hover:bg-[#1A1D24]'
              }`}
            >
              Stocks
            </button>
            <button
              onClick={() => onSelectCategory('fno')}
              className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                activeCategory === 'fno'
                  ? 'text-white border-b-2 border-[#00D09C] rounded-b-none'
                  : 'text-[#8B949E] hover:text-white hover:bg-[#1A1D24]'
              }`}
            >
              F&O
            </button>
            <button
              onClick={() => onSelectCategory('baskets')}
              className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                activeCategory === 'baskets'
                  ? 'text-white border-b-2 border-[#00D09C] rounded-b-none'
                  : 'text-[#8B949E] hover:text-white hover:bg-[#1A1D24]'
              }`}
            >
              Mutual Funds
            </button>
          </nav>
        </div>

        {/* Center: Search Bar */}
        <div className="flex-1 max-w-md mx-2 hidden sm:block">
          <button
            onClick={onOpenSearch}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg bg-[#181A20] border border-[#262A34] text-sm text-[#8B949E] hover:border-[#00D09C]/50 hover:bg-[#1D2028] transition group shadow-inner"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-[#8B949E] group-hover:text-[#00D09C] transition-colors" />
              <span className="text-xs sm:text-sm">Search Groww...</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-mono text-[#8B949E] bg-[#262A34] rounded">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Terminal Toggle Button matching Groww */}
          <button
            onClick={onToggleTerminal}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
              terminalMode
                ? 'bg-[#00D09C]/15 text-[#00D09C] border-[#00D09C]/40'
                : 'bg-[#181A20] text-[#8B949E] border-[#262A34] hover:text-white'
            }`}
          >
            <span className="inline-block w-2 h-2 rounded-full bg-[#00D09C] animate-pulse" />
            <span>Terminal</span>
          </button>

          {/* Devnet Network Pill */}
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded bg-emerald-950/40 text-[#00D09C] border border-emerald-800/40">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D09C]" />
            <span>Devnet</span>
          </div>

          {/* Devnet Faucet */}
          <div className="hidden sm:block">
            <FaucetButton />
          </div>

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => {
                setNotifOpen(!notifOpen);
                setProfileOpen(false);
              }}
              className="relative p-2 rounded-full hover:bg-[#1F222A] text-[#8B949E] hover:text-white transition"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#EB5B5B] text-[10px] font-bold text-white">
                  5
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-[#181A20] border border-[#262A34] shadow-2xl z-50 p-4 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-[#262A34] pb-3">
                  <h3 className="text-sm font-semibold text-white">Notifications</h3>
                  <button
                    onClick={() => setUnreadCount(0)}
                    className="text-xs text-[#00D09C] hover:underline"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="mt-2 divide-y divide-[#262A34] max-h-80 overflow-y-auto">
                  {USER_NOTIFICATIONS.map((n) => (
                    <div key={n.id} className="py-3 hover:bg-[#1F222A]/50 px-2 rounded-lg transition">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-white">{n.title}</p>
                        <span className="text-[10px] text-[#8B949E] shrink-0">{n.time}</span>
                      </div>
                      <p className="text-xs text-[#8B949E] mt-1 leading-relaxed">{n.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cart Button */}
          <button
            onClick={onOpenCart}
            className="relative hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#262A34] bg-[#181A20] text-sm text-[#8B949E] hover:text-white hover:border-[#00D09C]/40 transition"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="text-xs font-medium">Cart</span>
            <span className="px-1.5 py-0.2 rounded-full bg-[#262A34] text-[10px] font-bold text-white">
              {cartCount}
            </span>
          </button>

          {/* User Profile Avatar with dropdown (Utkarsh Jaiswal) */}
          <div className="relative">
            <button
              onClick={() => {
                setProfileOpen(!profileOpen);
                setNotifOpen(false);
              }}
              className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-[#00D09C]/40 transition"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 flex items-center justify-center text-white text-xs font-bold border border-white/10 shadow-sm">
                UJ
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#181A20] border border-[#262A34] shadow-2xl z-50 p-4 animate-in fade-in zoom-in-95 text-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[#262A34]">
                  <div>
                    <h4 className="font-semibold text-white">Utkarsh Jaiswal</h4>
                    <p className="text-xs text-[#8B949E] truncate">utkarshjaiswal285@gmail.com</p>
                  </div>
                  <Settings className="w-4 h-4 text-[#8B949E] hover:text-white cursor-pointer" />
                </div>

                <div className="py-3 border-b border-[#262A34] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Wallet className="w-4 h-4 text-[#00D09C]" />
                    <div>
                      <p className="text-xs font-semibold text-white">₹23.11</p>
                      <p className="text-[11px] text-[#8B949E]">Stocks, F&O balance ($23.11)</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#8B949E]" />
                </div>

                <div className="py-2 space-y-1">
                  <Link
                    href="/app?tab=orders"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center justify-between px-2 py-2 rounded-lg text-xs text-[#8B949E] hover:text-white hover:bg-[#1F222A] transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4" />
                      All Orders
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/portfolio"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center justify-between px-2 py-2 rounded-lg text-xs text-[#8B949E] hover:text-white hover:bg-[#1F222A] transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <Wallet className="w-4 h-4" />
                      Bank & Wallet Details
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  <div className="flex items-center justify-between px-2 py-2 rounded-lg text-xs text-[#8B949E] hover:text-white hover:bg-[#1F222A] transition cursor-pointer">
                    <span className="flex items-center gap-2.5">
                      <HelpCircle className="w-4 h-4" />
                      24 x 7 Customer Support
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                  <div className="flex items-center justify-between px-2 py-2 rounded-lg text-xs text-[#8B949E] hover:text-white hover:bg-[#1F222A] transition cursor-pointer">
                    <span className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4" />
                      Tax & PnL Reports
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>

                <div className="pt-3 border-t border-[#262A34] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-[#8B949E]">
                    <Moon className="w-4 h-4 text-[#00D09C]" />
                    <span>Dark Theme</span>
                  </div>
                  <button
                    onClick={() => setProfileOpen(false)}
                    className="text-xs text-[#EB5B5B] hover:underline"
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Solana Wallet Adapter Button */}
          <div className="scale-90 origin-right">
            <WalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}
