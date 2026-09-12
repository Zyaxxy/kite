'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Shield, Zap, Clock } from 'lucide-react';
import { Mark } from '../Mark';
import { KITE_BASKETS } from '../../lib/kite-data';

interface LandingPageProps {
  onEnterApp?: () => void;
}

export function LandingPage({ onEnterApp }: LandingPageProps) {
  // Calculator state
  const [sipAmount, setSipAmount] = useState(250);
  const [durationYears, setDurationYears] = useState(3);
  const [selectedBasketId, setSelectedBasketId] = useState(KITE_BASKETS[0].id);

  const selectedBasket = KITE_BASKETS.find((b) => b.id === selectedBasketId) || KITE_BASKETS[0];
  const annualReturn = selectedBasket.return1Y / 100;

  // Future value calculation for monthly SIP
  const monthlyRate = annualReturn / 12;
  const totalMonths = durationYears * 12;
  const totalInvested = sipAmount * totalMonths;
  const futureValue =
    monthlyRate > 0
      ? sipAmount * ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate)
      : totalInvested;
  const estimatedProfit = Math.max(0, futureValue - totalInvested);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-[#00D09C]/30 overflow-x-hidden">
      {/* 1. HERO SECTION */}
      <section className="relative min-h-[700px] w-full overflow-hidden flex flex-col justify-between pb-16">
        {/* Sky Background Image with Gradient Overlay */}
        <div className="absolute inset-0 z-0 select-none pointer-events-none">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url('/landing/74244c49f946a9541e288397eb49e9cce6e87dcf.png')`,
              backgroundPosition: 'center 20%'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#2878e8]/85 via-[#3b8ef5]/55 to-white/95" />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-white via-white/80 to-transparent" />
        </div>

        {/* Top Navbar */}
        <header className="relative z-20 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
          <div className="flex h-14 items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="h-9 w-9 rounded-xl bg-white/90 backdrop-blur-md p-1.5 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                <Mark className="h-5 w-5 text-[#2878e8]" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-white drop-shadow-sm">
                kite
              </span>
            </Link>

            <nav className="hidden md:flex items-center space-x-8 text-xs font-semibold tracking-wider text-white/90 uppercase drop-shadow-sm">
              <a href="#how-it-works" className="hover:text-white transition">How it works</a>
              <a href="#baskets" className="hover:text-white transition">Baskets</a>
              <a href="#calculator" className="hover:text-white transition">SIP Engine</a>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                href="/app"
                onClick={onEnterApp}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#D4F754] hover:bg-[#c2e841] text-slate-950 font-bold text-xs tracking-wide uppercase shadow-xl hover:scale-105 transition-all"
              >
                <span>Launch App</span>
                <ArrowUpRight className="w-4 h-4 text-slate-950" />
              </Link>
            </div>
          </div>
        </header>

        {/* Hero Headline & CTA */}
        <div className="relative z-10 mx-auto max-w-4xl px-4 pt-16 sm:pt-24 text-center">
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white drop-shadow-md leading-[1.12]">
            Tokenized US equities. Non-custodial. On Solana.
          </h1>
          <p className="mt-4 sm:mt-5 text-sm sm:text-base text-white/90 max-w-2xl mx-auto leading-relaxed drop-shadow-sm">
            Mint thematic baskets, set up recurring SIPs, and trade with real-time Pyth pricing. Wall Street efficiency meets Solana speed.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/app"
              onClick={onEnterApp}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-[#D4F754] hover:bg-[#c2e841] text-slate-950 font-bold text-xs uppercase tracking-wider shadow-2xl hover:scale-105 transition-all"
            >
              <span>Connect Wallet</span>
              <ArrowUpRight className="w-4 h-4 text-slate-950 stroke-[3]" />
            </Link>
            <a
              href="#baskets"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold text-xs uppercase tracking-wider border border-white/40 shadow-lg transition"
            >
              View Baskets
            </a>
          </div>
        </div>

        {/* Real SDK Baskets Showcase */}
        <div id="baskets" className="relative z-10 mx-auto max-w-6xl px-4 mt-20 w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {KITE_BASKETS.map((basket) => (
              <div key={basket.id} className="rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 p-5 shadow-xl flex flex-col hover:scale-105 transition-transform duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900">{basket.ticker}</h3>
                    <p className="text-xs text-slate-500 font-medium">{basket.name}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-emerald-600">+{basket.return1Y}%</span>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-0.5">1Y Return</p>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs pt-4 border-t border-slate-200/50">
                  <span className="text-slate-600 font-medium">{basket.assets.length} Assets</span>
                  <span className="font-mono text-slate-900 font-bold">${basket.price.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS SECTION */}
      <section id="how-it-works" className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-950">
              How it works
            </h2>
            <p className="text-sm text-slate-500 mt-3">
              Start allocating capital seamlessly on-chain in three simple steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center">
              <div className="w-14 h-14 bg-[#00D09C]/10 text-[#00D09C] rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="font-bold text-xl">1</span>
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-3">Connect Wallet</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Link your Phantom or Solflare wallet instantly. Experience non-custodial investing directly from your own wallet.
              </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center">
              <div className="w-14 h-14 bg-[#00D09C]/10 text-[#00D09C] rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="font-bold text-xl">2</span>
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-3">Pick a Basket or Stock</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Choose from curated thematic baskets like Magnificent 7 or AI Pioneers, or select individual US equities.
              </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center">
              <div className="w-14 h-14 bg-[#00D09C]/10 text-[#00D09C] rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="font-bold text-xl">3</span>
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-3">Mint with USDC</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Allocate capital securely using Solana USDC. Your assets are represented as tokens in your wallet.
              </p>
            </div>
          </div>

          <p className="text-center text-xs font-semibold text-slate-400 mt-16 uppercase tracking-wider">
            Built with Solana, Pyth, Jupiter, and USDC
          </p>
        </div>
      </section>

      {/* 3. INTERACTIVE SIP CALCULATOR */}
      <section id="calculator" className="py-24 bg-white border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl font-bold text-slate-950">See How Your Solana SIP Compounds</h2>
            <p className="text-sm text-slate-500 mt-3">
              Calculate projected returns for automated non-custodial rebalancing.
            </p>
          </div>

          <div className="max-w-4xl mx-auto bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-lg grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
            {/* Controls */}
            <div className="md:col-span-7 space-y-8">
              {/* Basket selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-3 uppercase tracking-wider">Target Basket</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {KITE_BASKETS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBasketId(b.id)}
                      className={`p-4 rounded-xl text-left border transition ${
                        selectedBasketId === b.id
                          ? 'border-[#00D09C] bg-emerald-50 text-emerald-900 ring-1 ring-[#00D09C]/50'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'
                      }`}
                    >
                      <span className="block text-sm font-bold text-slate-900">{b.ticker}</span>
                      <span className="text-[11px] text-emerald-600 font-mono mt-1 block">+{b.return1Y}% 1Y</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Monthly Amount Slider */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-3">
                  <span className="uppercase tracking-wider">Monthly Investment</span>
                  <span className="text-base font-mono text-[#00D09C]">${sipAmount} USDC</span>
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
                <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-2">
                  <span>$50</span>
                  <span>$1,000</span>
                  <span>$2,000</span>
                </div>
              </div>

              {/* Duration Slider */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-3">
                  <span className="uppercase tracking-wider">Time Horizon</span>
                  <span className="text-base font-mono text-slate-900">{durationYears} Years</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={durationYears}
                  onChange={(e) => setDurationYears(Number(e.target.value))}
                  className="w-full accent-slate-900"
                />
                <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-2">
                  <span>1 Year</span>
                  <span>5 Years</span>
                  <span>10 Years</span>
                </div>
              </div>
            </div>

            {/* Results Display */}
            <div className="md:col-span-5 bg-slate-950 text-white rounded-2xl p-8 shadow-xl space-y-6">
              <div>
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-2">
                  Projected Value
                </span>
                <div className="text-4xl font-bold font-mono text-[#D4F754]">
                  ${futureValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-slate-800 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Total Invested:</span>
                  <span className="font-mono text-white font-semibold">
                    ${totalInvested.toLocaleString('en-US')}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Estimated Gains:</span>
                  <span className="font-mono text-[#00D09C] font-semibold">
                    +${estimatedProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Custody:</span>
                  <span className="font-mono text-white font-semibold">100% Non-Custodial</span>
                </div>
              </div>

              <Link
                href="/app"
                onClick={onEnterApp}
                className="w-full mt-6 py-3.5 rounded-xl bg-[#00D09C] hover:bg-[#00e2ab] text-slate-950 font-bold text-xs uppercase tracking-wider block text-center shadow-lg transition"
              >
                Start This SIP
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. CALL TO ACTION BANNER */}
      <section className="py-20 bg-slate-950 text-white relative overflow-hidden">
        <div className="mx-auto max-w-5xl px-4 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to invest non-custodially?
          </h2>
          <p className="mt-4 text-sm text-slate-400 max-w-xl mx-auto">
            Connect your Phantom or Solflare wallet. Trade tokenized stocks and automated baskets securely on-chain.
          </p>

          <div className="mt-10 flex justify-center gap-4">
            <Link
              href="/app"
              onClick={onEnterApp}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#D4F754] text-slate-950 font-bold text-xs uppercase tracking-wider shadow-2xl hover:scale-105 transition"
            >
              <span>Launch App</span>
              <ArrowUpRight className="w-4 h-4 text-slate-950 stroke-[3]" />
            </Link>
          </div>
        </div>
      </section>

      {/* 5. FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-12 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-slate-950 flex items-center justify-center text-white">
              <Mark className="h-4 w-4 text-[#00D09C]" />
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight">kite</span>
            <span className="text-slate-400">· Solana Tokenized Stocks Hackathon</span>
          </div>

          <div className="flex items-center space-x-6 text-slate-600 font-medium">
            <Link href="/app" className="hover:text-slate-900 transition">Markets</Link>
            <Link href="/app" className="hover:text-slate-900 transition">Baskets</Link>
            <Link href="/app" className="hover:text-slate-900 transition">SIPs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
