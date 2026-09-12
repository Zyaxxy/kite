'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Repeat,
  Layers,
  Clock,
  Check,
  X,
  TrendingUp,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { CURATED_BASKETS } from '@kite/sdk';
import type { QuoteData } from '../../lib/market-types';

export function LandingPage() {
  const [sipAmount, setSipAmount] = useState(250);
  const [durationYears, setDurationYears] = useState(3);
  const [selectedBasketId, setSelectedBasketId] = useState(CURATED_BASKETS[0].id);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});

  useEffect(() => {
    fetch('/api/quotes?symbols=NVDA,AAPL,TSLA,MSFT,SPY,QQQ,SOL-USD,BTC-USD')
      .then((r) => r.json())
      .then((d) => {
        if (d?.quotes) setQuotes(d.quotes);
      })
      .catch(() => {});
  }, []);

  const selectedBasket =
    CURATED_BASKETS.find((b) => b.id === selectedBasketId) || CURATED_BASKETS[0];
  const annualReturn = selectedBasket.id === 'sol-ai-infra' ? 0.486 : 0.492;

  // Future value calculation for monthly SIP
  const monthlyRate = annualReturn / 12;
  const totalMonths = durationYears * 12;
  const totalInvested = sipAmount * totalMonths;
  const futureValue =
    monthlyRate > 0
      ? sipAmount * ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate)
      : totalInvested;
  const estimatedProfit = Math.max(0, futureValue - totalInvested);

  // Popular preview stocks
  const previewStocks = [
    { sym: 'NVDA', name: 'Nvidia Corp.', tag: 'dNVDA', fallbackPrice: 218.29, fallbackChange: 3.82 },
    { sym: 'AAPL', name: 'Apple Inc.', tag: 'dAAPL', fallbackPrice: 228.15, fallbackChange: -0.45 },
    { sym: 'TSLA', name: 'Tesla Inc.', tag: 'dTSLA', fallbackPrice: 215.80, fallbackChange: -2.10 },
    { sym: 'MSFT', name: 'Microsoft Corp.', tag: 'dMSFT', fallbackPrice: 432.90, fallbackChange: 1.15 },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-[#00D09C] selection:text-slate-950 overflow-x-hidden">
      {/* 1. TOP STICKY NAVBAR (Stitch spec) */}
      <header className="sticky top-0 z-50 w-full transition-all duration-300 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" aria-label="Kite Homepage" className="flex items-center group focus:outline-none">
              <span className="text-2xl font-extrabold tracking-tight text-slate-900">
                Kite<span className="text-[#00D09C]">.</span>
              </span>
            </Link>
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D09C] animate-pulse" />
              Solana Mainnet
            </span>
          </div>

          <nav className="hidden lg:flex items-center space-x-8 text-sm font-semibold text-slate-600">
            <a href="#markets" className="hover:text-slate-900 transition-colors">Markets</a>
            <a href="#thematic-baskets" className="hover:text-slate-900 transition-colors">Thematic Baskets</a>
            <a href="#automated-sip" className="hover:text-slate-900 transition-colors">Automated DCA</a>
            <a href="#security" className="hover:text-slate-900 transition-colors">Proof of Reserves</a>
            <a href="#compare" className="hover:text-slate-900 transition-colors">Comparison</a>
            <a href="#calculator" className="hover:text-slate-900 transition-colors">SIP Engine</a>
          </nav>

          <div className="flex items-center space-x-3">
            <Link
              href="/app"
              className="hidden sm:inline-flex items-center text-sm font-semibold text-slate-700 hover:text-slate-900 px-3 py-2 transition-colors"
            >
              View Demo
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full text-sm font-bold bg-[#00D09C] text-slate-950 shadow-sm hover:bg-[#00AC81] hover:shadow-[0_0_24px_rgba(0,208,156,0.45)] transition-all duration-200 transform hover:-translate-y-0.5"
            >
              <span>Connect Wallet</span>
              <ArrowUpRight className="w-4 h-4 ml-1.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* 2. ATMOSPHERIC HERO SECTION (Stitch screen 6d8d50cc9ca54ddfb38d6bef832c417b) */}
        <section className="relative pt-10 pb-20 lg:pt-16 lg:pb-32 overflow-hidden">
          {/* Sky & Meadow Atmospheric Background (Reference: Stitch IMAGE_3 & IMAGE_16) */}
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <img
              alt="Atmospheric sunny sky with lush meadow background"
              className="w-full h-[720px] lg:h-[860px] object-cover object-top opacity-90"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBvlPwh0n9-xF2Gj_4W3ELrFPPrfK11GqFWLjx4WMh4rTiUFkTFZhCqm2Y-5_4vIuNbafw5hsXF1ZAN9t05mN36JB-7la5L_cLrBRGNq7yMox56wpWytnfhEupW16DDLxs6jFcasg_w7VZhiIm3b6tnBbZMCKFw0Sic-XOgq1uDVNQkzjkRVZJz3FPMElBX4FfEqjlWn1VYxjrVcEa9M4FvrqQcBkbFELd6Vbr2hLcdN-Bjd7F6B4sE"
            />
            {/* Seamless gradient overlays to blend cleanly into white content area */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/40 to-transparent" />
            <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-sky-400/20 to-transparent" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Hero Announcement Pills (Stitch spec) */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 mb-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/75 backdrop-blur-md text-xs sm:text-sm font-bold text-slate-900 shadow-sm border border-white/60">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00D09C] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00D09C]" />
                </span>
                <span>Built on Solana</span>
              </div>
              <div className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-white/75 backdrop-blur-md text-xs sm:text-sm font-bold text-slate-900 shadow-sm border border-white/60">
                <span>24/7 Global US Equities</span>
              </div>
              <div className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-white/75 backdrop-blur-md text-xs sm:text-sm font-bold text-slate-800 shadow-sm border border-white/60">
                <span>100% Non-Custodial</span>
              </div>
            </div>

            {/* Main Headline */}
            <div className="text-center max-w-3xl mx-auto mb-10">
              <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-[1.12]">
                Building the future with <br className="hidden sm:block" />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-950 via-slate-800 to-[#00D09C]">
                  tokenized stocks & strategy
                </span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed">
                Trade US tokenized equities with zero commissions, build automated recurring SIPs, and invest in curated algorithmic baskets with sub-second Solana finality.
              </p>

              {/* CTAs */}
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                <Link
                  href="/app"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 rounded-full text-base font-bold bg-[#00D09C] text-slate-950 shadow-[0_0_24px_rgba(0,208,156,0.35)] hover:bg-[#00AC81] hover:scale-105 transition-all duration-200"
                >
                  <span>Start Investing Free</span>
                  <ArrowUpRight className="w-5 h-5 ml-2" />
                </Link>
                <a
                  href="#thematic-baskets"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-full text-base font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 shadow-sm transition-all duration-200"
                >
                  Explore Live Baskets
                </a>
              </div>
            </div>

            {/* 3D Perspective Hero Bento Row (Stitch spec) */}
            <div className="relative mt-12 lg:mt-16 max-w-6xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 items-stretch">
                {/* Floating Card 1: NVDA Quick Share */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-md flex flex-col justify-between hover:-translate-y-1 transition-transform">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-400">dNVDA</span>
                    <span className="text-xs font-mono font-bold text-emerald-600">+3.82%</span>
                  </div>
                  <div className="my-3">
                    <div className="text-xs text-slate-500 font-medium">NVIDIA Corp.</div>
                    <div className="text-xl font-mono font-bold text-slate-900">$218.29</div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Pyth Verified 24/7</span>
                </div>

                {/* Floating Card 2: AI Titans Basket */}
                <div className="bg-white rounded-2xl p-5 border border-[#00D09C]/40 shadow-lg flex flex-col justify-between hover:-translate-y-1 transition-transform sm:col-span-2 lg:col-span-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#00D09C]">dAI-TITAN</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-[10px] font-mono font-bold text-emerald-700">
                      BASKET
                    </span>
                  </div>
                  <div className="my-3">
                    <div className="text-xs text-slate-500 font-medium">AI Titans Index</div>
                    <div className="text-xl font-mono font-bold text-slate-900">+48.60%</div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-600 font-semibold">Weekly Rebalanced</span>
                </div>

                {/* Floating Card 3: Center Highlight (Total Equities TVL) */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:-translate-y-1 transition-transform sm:col-span-3 lg:col-span-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Solana Pools</span>
                    <span className="w-2 h-2 rounded-full bg-[#00D09C] animate-pulse" />
                  </div>
                  <div className="my-3">
                    <div className="text-xs text-slate-300">Total Equities TVL</div>
                    <div className="text-2xl font-mono font-bold text-white tabular-nums">$194.8M</div>
                  </div>
                  <span className="text-[10px] font-mono text-[#00D09C] font-semibold">1:1 Qualified Custody</span>
                </div>

                {/* Floating Card 4: Algorithmic Rebalancing */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-md flex flex-col justify-between hover:-translate-y-1 transition-transform">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-400">MAG7</span>
                    <span className="text-xs font-mono font-bold text-emerald-600">+49.20%</span>
                  </div>
                  <div className="my-3">
                    <div className="text-xs text-slate-500 font-medium">Magnificent 7 Tech</div>
                    <div className="text-xl font-mono font-bold text-slate-900">$248.50</div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Equal-Weighted</span>
                </div>

                {/* Floating Card 5: Non-Custodial Guarantee */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-md flex flex-col justify-between hover:-translate-y-1 transition-transform">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-400">SECURITY</span>
                    <ShieldCheck className="w-4 h-4 text-[#00D09C]" />
                  </div>
                  <div className="my-3">
                    <div className="text-xs text-slate-500 font-medium">Self-Custody</div>
                    <div className="text-lg font-bold text-slate-900">Zero Vault Lock</div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Keys Stay in Wallet</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. INSTITUTIONAL PARTNER TICKER (Stitch spec) */}
        <section className="border-y border-slate-200 bg-white py-7 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">
              Powering the decentralized equity revolution with institutional partners
            </p>
            <div className="flex flex-wrap items-center justify-around gap-8 sm:gap-14 text-slate-500 font-mono text-sm font-bold">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#14F195]" />
                <span>SOLANA</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#7C3AED]" />
                <span>PYTH NETWORK</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2775CA]" />
                <span>CIRCLE USDC</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00D09C]" />
                <span>JUPITER DEX</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-900" />
                <span>PHOENIX CLOB</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. CORE BENTO FEATURE GRID (Stitch spec) */}
        <section id="thematic-baskets" className="py-20 lg:py-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-extrabold tracking-widest uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
              Why Invest With Kite
            </span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              A global neo-brokerage dedicated to building smarter, non-custodial wealth
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Bento Card 1: 1-Click Thematic Baskets (7 Cols) */}
            <div className="md:col-span-7 bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#00D09C] flex items-center justify-center font-black text-xl mb-6 border border-emerald-100">
                  <Layers className="w-6 h-6 text-slate-900" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Curated Themes</span>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                  1-Click Algorithmic Thematic Baskets
                </h3>
                <p className="mt-3 text-slate-600 text-sm sm:text-base leading-relaxed max-w-xl">
                  Diversify like top-tier institutions without high management fees. Buy balanced indexes of AI chipmakers, US Mega-Caps, or Pre-IPO tech with a single atomic transaction.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <div className="text-xs font-bold text-slate-500">Mag 7 Index</div>
                  <div className="text-lg font-black text-slate-900 mt-1">+49.2%</div>
                  <span className="text-[10px] text-emerald-600 font-bold">Auto-rebalanced</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <div className="text-xs font-bold text-slate-500">AI Titans</div>
                  <div className="text-lg font-black text-slate-900 mt-1">+48.6%</div>
                  <span className="text-[10px] text-emerald-600 font-bold">Weekly Quant</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <div className="text-xs font-bold text-slate-500">Pre-IPO Tech</div>
                  <div className="text-lg font-black text-slate-900 mt-1">+28.4%</div>
                  <span className="text-[10px] text-emerald-600 font-bold">OpenAI & SpaceX</span>
                </div>
              </div>
            </div>

            {/* Bento Card 2: Automated DCA / SIP Engine (5 Cols) */}
            <div id="automated-sip" className="md:col-span-5 bg-gradient-to-br from-[#0B132B] to-[#1E293B] text-white rounded-3xl p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white/10 text-[#00D09C] flex items-center justify-center text-xl font-bold mb-6 border border-white/10">
                  <Repeat className="w-6 h-6 text-[#00D09C]" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Set & Forget SIP</span>
                <h3 className="text-2xl sm:text-3xl font-black text-white mt-1">Non-Custodial DCA Engine</h3>
                <p className="mt-3 text-slate-300 text-sm leading-relaxed">
                  Dollar-cost average daily, weekly, or monthly into Apple, Tesla, or whole thematic indices straight from your Phantom or Solflare wallet with zero gas drag.
                </p>
              </div>

              <div className="mt-8 bg-white/10 rounded-2xl p-4 border border-white/10">
                <div className="flex items-center justify-between text-xs text-slate-300 mb-2 font-mono">
                  <span>Active DCA Program</span>
                  <span className="text-[#00D09C] font-bold">Running (Auto)</span>
                </div>
                <div className="text-lg font-black text-white font-mono">$250 / Every Monday</div>
                <div className="mt-2 text-xs text-slate-400">Funding Source: Connected Solana USDC Wallet</div>
              </div>
            </div>

            {/* Bento Card 3: 24/7/365 US Markets */}
            <div className="md:col-span-4 bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-xl mb-6 border border-sky-100">
                <Clock className="w-6 h-6 text-sky-600" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trading Freedom</span>
              <h3 className="text-xl font-black text-slate-900 mt-1">24/7/365 US Markets</h3>
              <p className="mt-2.5 text-slate-600 text-sm leading-relaxed">
                No more waiting for the 9:30 AM New York opening bell. React immediately to weekend earnings, macro policy, and global catalysts.
              </p>
            </div>

            {/* Bento Card 4: Verifiable 1:1 Backing */}
            <div id="security" className="md:col-span-4 bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xl mb-6 border border-emerald-100">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Security & Trust</span>
              <h3 className="text-xl font-black text-slate-900 mt-1">Verifiable 1:1 Backing</h3>
              <p className="mt-2.5 text-slate-600 text-sm leading-relaxed">
                Every tokenized share corresponds to real shares held under qualified custodian supervision with live cryptographic attestations.
              </p>
            </div>

            {/* Bento Card 5: Micro-Investing From $1 */}
            <div className="md:col-span-4 bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-xl mb-6 border border-purple-100">
                <Zap className="w-6 h-6 text-purple-600" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Micro-Investing</span>
              <h3 className="text-xl font-black text-slate-900 mt-1">Invest From $1</h3>
              <p className="mt-2.5 text-slate-600 text-sm leading-relaxed">
                Buy high-ticket shares like Microsoft, Nvidia, or Amazon in fractions. No wire fees, zero minimum deposits, and zero account fees.
              </p>
            </div>
          </div>
        </section>

        {/* 5. LIVE MARKETS PREVIEW (Stitch spec with real live prices) */}
        <section id="markets" className="py-20 bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-10">
              <div>
                <span className="text-[#00D09C] text-xs font-extrabold tracking-widest uppercase">
                  Live Solana Orderbooks
                </span>
                <h2 className="text-3xl sm:text-4xl font-black mt-2">Popular Tokenized US Equities</h2>
                <p className="text-slate-400 text-sm mt-2">
                  Powered by decentralized low-latency Pyth Oracle streaming price feeds.
                </p>
              </div>

              <div className="mt-4 md:mt-0 flex gap-2">
                <Link
                  href="/app"
                  className="px-4 py-2 rounded-xl bg-[#00D09C] text-slate-950 font-bold text-xs hover:brightness-110 transition shadow-sm"
                >
                  Enter Trading Desk
                </Link>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur">
              <table className="w-full text-left text-sm">
                <thead className="text-xs font-bold uppercase text-slate-400 border-b border-slate-800 bg-slate-900/80">
                  <tr>
                    <th className="py-4 px-6">Asset</th>
                    <th className="py-4 px-6">Ticker</th>
                    <th className="py-4 px-6">Price (USDC)</th>
                    <th className="py-4 px-6">24h Change</th>
                    <th className="py-4 px-6 text-right">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium font-mono text-xs">
                  {previewStocks.map((stock) => {
                    const q = quotes[stock.sym];
                    const price = q?.price ?? stock.fallbackPrice;
                    const changePct = q?.changePct ?? stock.fallbackChange;
                    const isUp = changePct >= 0;

                    return (
                      <tr key={stock.sym} className="hover:bg-slate-800/40 transition">
                        <td className="py-4 px-6 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-800 text-[#00D09C] font-bold flex items-center justify-center text-sm border border-slate-700">
                            {stock.sym.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-bold text-white font-sans text-sm">{stock.name}</div>
                            <div className="text-[11px] text-slate-400 font-sans">Tokenized Solana Share</div>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-slate-300 font-bold">{stock.tag}</td>
                        <td className="py-4 px-6 font-bold text-white text-sm tabular-nums">${price.toFixed(2)}</td>
                        <td className={`py-4 px-6 font-bold tabular-nums ${isUp ? 'text-[#00D09C]' : 'text-red-400'}`}>
                          {isUp ? '+' : ''}{changePct.toFixed(2)}%
                        </td>
                        <td className="py-4 px-6 text-right">
                          <Link
                            href="/app"
                            className="inline-block px-4 py-1.5 rounded-lg bg-[#00D09C] text-slate-950 font-bold text-xs hover:brightness-110 transition shadow-sm font-sans"
                          >
                            Trade 24/7
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 text-center">
              <Link href="/app" className="inline-flex items-center text-sm font-bold text-[#00D09C] hover:underline">
                View all listed US Stocks, ETFs & Algorithmic Baskets on Trading Desk →
              </Link>
            </div>
          </div>
        </section>

        {/* 6. BROKERAGE COMPARISON SECTION (Stitch spec) */}
        <section id="compare" className="py-20 lg:py-28 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">
              The Direct Upgrade
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-3">
              Old-world Brokerage vs. Kite Protocol
            </h2>
            <p className="text-slate-600 mt-3 text-sm sm:text-base">
              Why global investors are moving their equities portfolios on-chain.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Legacy Brokers */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm">
              <div className="inline-block px-3 py-1 bg-red-100 text-red-700 text-xs font-extrabold rounded-full mb-6 uppercase">
                Traditional US Brokers
              </div>
              <ul className="space-y-5 text-sm text-slate-600">
                <li className="flex items-start">
                  <X className="w-5 h-5 text-red-500 mr-3 shrink-0" />
                  <div>
                    <strong className="text-slate-900 block">T+1 or T+2 Settlement Wait</strong>
                    Cash is locked for days before withdrawal or redeployment.
                  </div>
                </li>
                <li className="flex items-start">
                  <X className="w-5 h-5 text-red-500 mr-3 shrink-0" />
                  <div>
                    <strong className="text-slate-900 block">Restricted 9:30 AM - 4:00 PM EST Hours</strong>
                    Zero ability to manage risk during weekend or Asian trading hours.
                  </div>
                </li>
                <li className="flex items-start">
                  <X className="w-5 h-5 text-red-500 mr-3 shrink-0" />
                  <div>
                    <strong className="text-slate-900 block">$25 - $45 International Wire Fees</strong>
                    Punitive deposit charges and 3-5% FX currency conversions.
                  </div>
                </li>
                <li className="flex items-start">
                  <X className="w-5 h-5 text-red-500 mr-3 shrink-0" />
                  <div>
                    <strong className="text-slate-900 block">Custodial Risk & Withdrawal Freezes</strong>
                    You are at the mercy of broker maintenance windows and regional bans.
                  </div>
                </li>
              </ul>
            </div>

            {/* Kite Neo-Brokerage */}
            <div className="bg-gradient-to-br from-slate-900 to-[#0F1E36] rounded-3xl p-8 border border-[#00D09C]/30 shadow-xl text-white">
              <div className="inline-block px-3 py-1 bg-[#00D09C] text-slate-950 text-xs font-extrabold rounded-full mb-6 uppercase">
                Kite Solana Neo-Brokerage
              </div>
              <ul className="space-y-5 text-sm text-slate-300">
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-[#00D09C] mr-3 shrink-0" />
                  <div>
                    <strong className="text-white block">Sub-Second Atomic Settlement</strong>
                    Instant trading and wallet liquidity via Solana high-speed consensus.
                  </div>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-[#00D09C] mr-3 shrink-0" />
                  <div>
                    <strong className="text-white block">True 24/7/365 Non-Stop Markets</strong>
                    Trade whenever world news happens — including nights and weekends.
                  </div>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-[#00D09C] mr-3 shrink-0" />
                  <div>
                    <strong className="text-white block">&lt; $0.001 Instant USDC Transfers</strong>
                    Deposit from anywhere globally in 1 block without intermediaries.
                  </div>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-[#00D09C] mr-3 shrink-0" />
                  <div>
                    <strong className="text-white block">Self-Custodial Wallet Ownership</strong>
                    Tokens live in your personal Phantom, Solflare, or Backpack wallet.
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* 7. INTERACTIVE SIP COMPOUNDING CALCULATOR */}
        <section id="calculator" className="py-24 bg-white border-t border-slate-100">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="text-3xl font-black text-slate-950">See How Your Solana SIP Compounds</h2>
              <p className="text-sm text-slate-500 mt-3">
                Calculate projected returns for automated non-custodial rebalancing.
              </p>
            </div>

            <div className="max-w-4xl mx-auto bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-lg grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
              <div className="md:col-span-7 space-y-8">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-3 uppercase tracking-wider">
                    Target Thematic Basket
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CURATED_BASKETS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBasketId(b.id)}
                        className={`p-4 rounded-xl text-left border transition ${
                          selectedBasketId === b.id
                            ? 'border-[#00D09C] bg-emerald-50 text-emerald-900 ring-1 ring-[#00D09C]/50'
                            : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'
                        }`}
                      >
                        <span className="block text-sm font-bold text-slate-900">{b.name}</span>
                        <span className="text-[11px] text-emerald-600 font-mono mt-1 block">
                          {b.id === 'sol-ai-infra' ? '+48.6%' : '+49.2%'} 1Y
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-3">
                    <span className="uppercase tracking-wider">Monthly Investment</span>
                    <span className="text-base font-mono text-[#00D09C] font-bold">${sipAmount} USDC</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="2000"
                    step="50"
                    value={sipAmount}
                    onChange={(e) => setSipAmount(Number(e.target.value))}
                    className="w-full accent-[#00D09C]"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-2">
                    <span>$50</span>
                    <span>$1,000</span>
                    <span>$2,000</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-3">
                    <span className="uppercase tracking-wider">Time Horizon</span>
                    <span className="text-base font-mono text-slate-900 font-bold">{durationYears} Years</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={durationYears}
                    onChange={(e) => setDurationYears(Number(e.target.value))}
                    className="w-full accent-slate-900"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-2">
                    <span>1 Year</span>
                    <span>5 Years</span>
                    <span>10 Years</span>
                  </div>
                </div>
              </div>

              {/* Calculator Output */}
              <div className="md:col-span-5 bg-gradient-to-br from-slate-900 to-[#0F1E36] text-white p-6 sm:p-8 rounded-2xl shadow-xl flex flex-col justify-between space-y-6">
                <div>
                  <span className="text-xs font-mono uppercase text-slate-400">Total Projected Wealth</span>
                  <div className="text-3xl sm:text-4xl font-black text-white font-mono mt-1 tabular-nums">
                    ${futureValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-700 text-xs font-mono">
                  <div className="flex justify-between text-slate-300">
                    <span>Total Invested:</span>
                    <span className="font-bold text-white">${totalInvested.toLocaleString()} USDC</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Est. Wealth Gain:</span>
                    <span className="font-bold text-[#00D09C]">+${estimatedProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>

                <Link
                  href="/app"
                  className="w-full py-3 rounded-xl bg-[#00D09C] hover:bg-[#00AC81] text-slate-950 font-bold text-xs text-center transition-all shadow-[0_0_16px_rgba(0,208,156,0.3)]"
                >
                  Start This SIP on Kite
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 8. PRE-FOOTER CTA SECTION (Stitch spec) */}
        <section className="relative py-24 bg-gradient-to-br from-slate-950 via-slate-900 to-[#0A2540] text-white overflow-hidden text-center">
          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              Ready to elevate your wealth portfolio?
            </h2>
            <p className="mt-4 text-slate-300 text-base sm:text-lg max-w-xl mx-auto font-medium">
              Join thousands of global investors trading tokenized US stocks 24/7 with zero custodian lock-in.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center items-center gap-4">
              <Link
                href="/app"
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-full text-base font-bold bg-[#00D09C] text-slate-950 hover:bg-[#00AC81] shadow-[0_0_30px_rgba(0,208,156,0.4)] transition transform hover:scale-105"
              >
                <span>Launch Kite App</span>
                <ArrowUpRight className="w-5 h-5 ml-2" />
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 font-mono">
              <span>Instant Solana Wallet Onboarding</span>
              <span>•</span>
              <span>Demo Paper Trading Ready</span>
              <span>•</span>
              <span>100% Non-Custodial</span>
            </div>
          </div>
        </section>
      </main>

      {/* 9. MAIN SITE FOOTER */}
      <footer className="bg-[#080E1E] text-slate-400 text-sm border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-xl font-black text-white">Kite<span className="text-[#00D09C]">.</span></span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mb-4">
                Kite is an onchain neo-brokerage protocol enabling fractional tokenized equities, algorithmic recurring SIP investments, and synthetic baskets on the Solana blockchain.
              </p>
              <span className="inline-flex items-center px-2 py-1 rounded bg-slate-800 text-[11px] text-[#00D09C] font-mono">
                <span className="w-2 h-2 rounded-full bg-[#00D09C] mr-1.5 animate-pulse" />
                All Systems Operational
              </span>
            </div>

            <div>
              <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-4">Products</h4>
              <ul className="space-y-2.5 text-xs">
                <li><Link href="/app" className="hover:text-white transition">Tokenized Stocks</Link></li>
                <li><Link href="/baskets" className="hover:text-white transition">Thematic Indices</Link></li>
                <li><Link href="/sip" className="hover:text-white transition">Automated DCA</Link></li>
                <li><Link href="/portfolio" className="hover:text-white transition">Portfolio Center</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-4">Security</h4>
              <ul className="space-y-2.5 text-xs">
                <li><span className="hover:text-white transition cursor-pointer">Proof of Reserves</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Pyth Price Feeds</span></li>
                <li><span className="hover:text-white transition cursor-pointer">DTCC Qualified Custody</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Smart Contract Audits</span></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-4">Ecosystem</h4>
              <ul className="space-y-2.5 text-xs">
                <li><span className="hover:text-white transition cursor-pointer">Solana Foundation</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Jupiter DEX Routing</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Pyth Network</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Circle USDC</span></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800/80 pt-8 text-[11px] text-slate-400 leading-normal space-y-2">
            <p>
              <strong>Regulatory Notice & Disclaimers:</strong> Tokenized equity products are digital representation tokens backed by underlying shares held in audited custodial trusts or synthesized through fully collateralized DeFi protocols. Not available to restricted jurisdictions. Cryptocurrency and derivative investments involve risk of loss.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-between pt-4 text-slate-400 text-xs">
              <p>© 2026 Kite Protocol Ltd. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
