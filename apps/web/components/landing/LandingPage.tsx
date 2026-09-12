'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowUpRight,
  TrendingUp,
  Shield,
  Zap,
  Globe,
  Star,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronRight,
  ExternalLink,
  Cpu,
  BarChart3,
  Lock,
  Clock
} from 'lucide-react';
import { Mark } from '../Mark';
import { POPULAR_BASKETS } from '../../lib/groww-data';

interface LandingPageProps {
  onEnterApp?: () => void;
}

export function LandingPage({ onEnterApp }: LandingPageProps) {
  // Calculator state
  const [sipAmount, setSipAmount] = useState(250);
  const [durationYears, setDurationYears] = useState(3);
  const [selectedBasketId, setSelectedBasketId] = useState('sol-mag7');

  const selectedBasket = POPULAR_BASKETS.find((b) => b.id === selectedBasketId) || POPULAR_BASKETS[0];
  const annualReturn = selectedBasket.return1Y / 100; // e.g. 0.49

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
      {/* 1. HERO SECTION WITH SKY BACKGROUND MATCHING Landing-page-UIUX.jpeg */}
      <section className="relative min-h-[850px] lg:min-h-[920px] w-full overflow-hidden flex flex-col justify-between pb-12">
        {/* Sky Background Image with Gradient Overlay */}
        <div className="absolute inset-0 z-0 select-none pointer-events-none">
          {/* Cloud Sky Background */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url('/landing/74244c49f946a9541e288397eb49e9cce6e87dcf.png')`,
              backgroundPosition: 'center 20%'
            }}
          />
          {/* Soft blue radiant gradient to recreate the exact vibrant cyan-blue sky from Landing-page-UIUX.jpeg */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#2878e8]/85 via-[#3b8ef5]/55 to-white/95" />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-white via-white/80 to-transparent" />
        </div>

        {/* Top Floating Navbar matching Landing-page-UIUX.jpeg */}
        <header className="relative z-20 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
          <div className="flex h-14 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="h-9 w-9 rounded-xl bg-white/90 backdrop-blur-md p-1.5 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                <Mark className="h-5 w-5 text-[#2878e8]" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-white drop-shadow-sm">
                kite
              </span>
            </Link>

            {/* Nav links */}
            <nav className="hidden md:flex items-center space-x-8 text-xs font-semibold tracking-wider text-white/90 uppercase drop-shadow-sm">
              <a href="#about" className="hover:text-white transition">About Us</a>
              <a href="#products" className="hover:text-white transition">Baskets</a>
              <a href="#calculator" className="hover:text-white transition">SIP Engine</a>
              <Link href="/app" className="hover:text-white transition">Groww Terminal</Link>
            </nav>

            {/* CTA Button matching Landing-page-UIUX.jpeg: Lime Green Pill */}
            <div className="flex items-center gap-3">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#D4F754] hover:bg-[#c2e841] text-slate-950 font-bold text-xs tracking-wide uppercase shadow-xl hover:scale-105 transition-all"
              >
                <span>Launch App</span>
                <ArrowUpRight className="w-4 h-4 text-slate-950" />
              </Link>
            </div>
          </div>
        </header>

        {/* Hero Headline & CTA matching Landing-page-UIUX.jpeg */}
        <div className="relative z-10 mx-auto max-w-4xl px-4 pt-12 sm:pt-16 text-center">
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white drop-shadow-md leading-[1.12]">
            Building the future of tokenized equities on Solana
          </h1>
          <p className="mt-4 sm:mt-5 text-sm sm:text-base text-white/90 max-w-2xl mx-auto leading-relaxed drop-shadow-sm">
            1-Click thematic stock baskets (SOL-MAG7, SOL-AI), automated non-custodial Systematic Investment Plans (SIPs), and real-time Pyth oracles. Wall Street efficiency meets Solana speed.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold text-xs uppercase tracking-wider border border-white/40 shadow-lg transition"
            >
              View Demo
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-[#D4F754] hover:bg-[#c2e841] text-slate-950 font-bold text-xs uppercase tracking-wider shadow-2xl hover:scale-105 transition-all"
            >
              <span>Get Started</span>
              <ArrowUpRight className="w-4 h-4 text-slate-950 stroke-[3]" />
            </Link>
          </div>
        </div>

        {/* 3D FLOATING SHOWCASE CARDS ARC MATCHING Landing-page-UIUX.jpeg */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 mt-12 w-full">
          <div className="flex items-center justify-center -space-x-2 sm:-space-x-4 overflow-x-auto pb-4 no-scrollbar">
            {/* Card 1: Network Status & Finality (Tilted left) */}
            <div className="w-44 sm:w-52 h-64 rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 p-4 shadow-2xl flex flex-col justify-between transform -rotate-6 hover:rotate-0 hover:scale-105 transition-all duration-300 shrink-0 select-none">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#00D09C] animate-pulse" />
                  <span className="text-[10px] font-mono font-bold text-slate-500">SOLANA SPEED</span>
                </div>
                <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 mb-2">
                  <Zap className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">400ms Finality</h4>
                <p className="text-[11px] text-slate-500 mt-1">Zero gas spikes & microscopic transaction costs.</p>
              </div>
              <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[10px] font-mono text-emerald-600 font-semibold">
                <span>TPS: 3,420</span>
                <span>Devnet Live</span>
              </div>
            </div>

            {/* Card 2: 49% Return Card (Matching Landing-page-UIUX.jpeg) */}
            <div className="w-48 sm:w-56 h-68 rounded-2xl bg-slate-950/90 text-white backdrop-blur-xl border border-white/20 p-5 shadow-2xl flex flex-col justify-between transform -rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300 shrink-0 select-none">
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Performance</span>
                  <span className="text-[#00D09C] font-mono font-bold">+49.2%</span>
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-bold font-mono tracking-tight text-white">49%</span>
                  <span className="text-xs text-slate-400 ml-1.5">1Y Return</span>
                </div>
                <div className="h-12 w-full mt-2">
                  <svg viewBox="0 0 100 30" className="w-full h-full">
                    <polyline
                      fill="none"
                      stroke="#00D09C"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      points="0,25 20,20 40,22 60,12 80,15 100,4"
                    />
                  </svg>
                </div>
              </div>
              <div className="pt-3 border-t border-white/10 flex justify-between text-[10px] text-slate-400">
                <span>SOL-MAG7</span>
                <span className="text-emerald-400 font-semibold">Overweight</span>
              </div>
            </div>

            {/* Card 3: 520k+ Data Points Card (Matching Landing-page-UIUX.jpeg) */}
            <div className="w-48 sm:w-56 h-72 rounded-2xl bg-white/95 backdrop-blur-xl border border-white/80 p-5 shadow-2xl flex flex-col justify-between transform hover:scale-105 transition-all duration-300 shrink-0 select-none">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Oracle Feeds</span>
                </div>
                <div className="mt-4">
                  <span className="text-xs text-slate-500 block">Pyth Price Queries</span>
                  <span className="text-3xl font-bold text-slate-900 font-mono tracking-tight">
                    520k+
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                  Real-time equity feeds with confidence interval bounds.
                </p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Latency</span>
                <span className="font-mono font-bold text-blue-600">&lt;350ms</span>
              </div>
            </div>

            {/* Card 4: CENTER GLOWING BLUE "Non-Custodial SIP" (Matching Landing-page-UIUX.jpeg) */}
            <div className="w-52 sm:w-60 h-76 rounded-2xl bg-gradient-to-tr from-[#0052FF] via-[#0070F3] to-[#00DFD8] text-white p-5 shadow-2xl flex flex-col justify-between transform scale-105 hover:scale-110 transition-all duration-300 shrink-0 z-10 select-none border border-white/40 shadow-blue-500/30">
              <div>
                <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-3">
                  <Calendar className="w-5 h-5" />
                </div>
                <h4 className="text-base font-bold text-white leading-tight">Automated SIP</h4>
                <p className="text-xs text-white/80 mt-1">
                  Non-custodial recurring DCA in USDC via Jupiter.
                </p>
              </div>
              <div>
                <div className="p-3 rounded-xl bg-black/20 backdrop-blur-md border border-white/15 space-y-1">
                  <div className="flex justify-between text-[11px] text-white/80">
                    <span>Recurring DCA</span>
                    <span className="font-bold text-white">$500/mo</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-white/80">
                    <span>Protocol Fee</span>
                    <span className="font-bold text-[#D4F754]">0.00%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 5: Pre-IPO & Thematic Baskets (Matching Landing-page-UIUX.jpeg) */}
            <div className="w-48 sm:w-56 h-72 rounded-2xl bg-slate-900 text-white p-5 shadow-2xl flex flex-col justify-between transform rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300 shrink-0 select-none border border-white/10">
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  <span>Thematic Indices</span>
                </div>
                <h4 className="text-base font-bold text-white mt-3">Pre-IPO Tech</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Secondary exposure to OpenAI, SpaceX, and Stripe.
                </p>
              </div>
              <div className="space-y-1.5 text-[11px] font-mono">
                <div className="flex justify-between text-slate-300">
                  <span>preOPENAI</span>
                  <span className="text-white">$150.00</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>preSPACEX</span>
                  <span className="text-white">$210.00</span>
                </div>
              </div>
            </div>

            {/* Card 6: Proof of Reserves & PDA Security (Tilted right) */}
            <div className="w-44 sm:w-52 h-64 rounded-2xl bg-white/85 backdrop-blur-xl border border-white/60 p-4 shadow-2xl flex flex-col justify-between transform rotate-6 hover:rotate-0 hover:scale-105 transition-all duration-300 shrink-0 select-none">
              <div>
                <div className="h-10 w-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-600 mb-2">
                  <Shield className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">100% Non-Custodial</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Assets secured in Anchor Program Derived Accounts.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>Collateral: 1:1</span>
                <span className="text-[#00D09C] font-semibold">Audited</span>
              </div>
            </div>
          </div>

          {/* Social Proof Rating Badge matching Landing-page-UIUX.jpeg */}
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-md text-xs font-semibold text-slate-700">
              <span>Rated 4.9/5 by 4,900+ Solana Investors</span>
              <div className="flex text-amber-400">
                {'★★★★★'.split('').map((s, i) => (
                  <span key={i}>{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PARTNER / ECOSYSTEM LOGO TICKER */}
      <section className="py-8 bg-white border-y border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">
            Powered by Premier Solana Infrastructure
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 opacity-70 grayscale hover:grayscale-0 transition-all duration-300">
            <span className="text-base font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600" /> Solana
            </span>
            <span className="text-base font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Pyth Network
            </span>
            <span className="text-base font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Jupiter Exchange
            </span>
            <span className="text-base font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Circle USDC
            </span>
            <span className="text-base font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Token-2022
            </span>
            <span className="text-base font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Superteam
            </span>
          </div>
        </div>
      </section>

      {/* 3. BENTO GRID SECTION: "ABOUT US / WHY KITE" MATCHING Landing-page-UIUX.jpeg */}
      <section id="about" className="py-20 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2 block">
              • About Us
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-950">
              A global neo-brokerage dedicated to building smarter and more adaptive markets
            </h2>
          </div>

          {/* Bento Grid layout matching the middle section of Landing-page-UIUX.jpeg */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Left Big Card with 120+ Collaborating metric */}
            <div className="md:col-span-4 rounded-3xl bg-gradient-to-br from-[#1E62D0] to-[#0A3886] p-8 text-white shadow-xl flex flex-col justify-between relative overflow-hidden min-h-[380px]">
              <div className="relative z-10">
                <span className="text-xs font-bold tracking-wider uppercase text-blue-200">
                  Global Reach
                </span>
                <h3 className="text-2xl font-bold text-white mt-2 leading-snug">
                  1-Click Access to Global Tokenized Equities
                </h3>
              </div>

              {/* Bottom metric card overlay matching screenshot */}
              <div className="relative z-10 bg-white/95 text-slate-900 rounded-2xl p-5 shadow-lg backdrop-blur-md">
                <span className="text-4xl font-bold font-mono text-slate-900 block">120+</span>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium">
                  Collaborating with leading tokenized asset issuers and on-chain liquidity providers.
                </p>
              </div>
            </div>

            {/* Middle Card: Measurable 100% Commitment & Testimonial */}
            <div className="md:col-span-4 rounded-3xl bg-white border border-slate-200/80 p-8 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs text-slate-500 font-semibold block">Commitment to measurable</span>
                <span className="text-5xl font-bold text-slate-900 font-mono tracking-tight mt-2 block">
                  100%
                </span>
                <p className="text-xs text-slate-500 mt-1">Non-custodial user asset protection.</p>
              </div>

              <div className="pt-6 border-t border-slate-100 mt-8">
                {/* Avatar stack */}
                <div className="flex items-center -space-x-2 mb-3">
                  <div className="h-8 w-8 rounded-full bg-purple-500 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">
                    UJ
                  </div>
                  <div className="h-8 w-8 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">
                    AK
                  </div>
                  <div className="h-8 w-8 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">
                    SL
                  </div>
                </div>
                <p className="text-xs text-slate-600 italic leading-relaxed">
                  &ldquo;Kite&apos;s Anchor PDA architecture completely reshaped how we invest on Solana. It&apos;s efficient, intelligent, and seamless.&rdquo;
                </p>
              </div>
            </div>

            {/* Right Column: Lime Green Card (520k+) & Sleek Black Pill Card (20+ Continents) */}
            <div className="md:col-span-4 flex flex-col gap-6 justify-between">
              {/* Lime Green Card matching screenshot */}
              <div className="rounded-3xl bg-[#D4F754] p-8 text-slate-950 shadow-sm flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Data Points
                  </span>
                  <div className="text-4xl font-bold font-mono tracking-tight mt-2">520k+</div>
                </div>
                <p className="text-xs text-slate-800 font-medium leading-relaxed mt-4">
                  Analyzed monthly to power automated rebalancing and high-frequency Pyth feeds.
                </p>
              </div>

              {/* Black Pill Card matching screenshot */}
              <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 font-semibold block">Global Continents</span>
                  <span className="text-xs text-slate-500">24/7 market access</span>
                </div>
                <span className="text-3xl font-bold font-mono text-[#D4F754]">20+</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. PRODUCTS & SERVICES SECTION MATCHING Landing-page-UIUX.jpeg */}
      <section id="products" className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2 block">
                • Products & Services
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-950">
                Comprehensive investing and intelligent innovation
              </h2>
              <p className="text-sm text-slate-500 mt-2 max-w-xl">
                Whether you&apos;re optimizing today or building for tomorrow, Kite helps you allocate capital faster with non-custodial confidence.
              </p>
            </div>

            <Link
              href="/app"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-slate-950 text-white font-bold text-xs uppercase tracking-wider shadow-lg hover:bg-slate-800 transition shrink-0"
            >
              <span>Get Started</span>
              <ArrowUpRight className="w-4 h-4 text-[#D4F754]" />
            </Link>
          </div>

          {/* 3 Polish Feature Cards matching bottom of Landing-page-UIUX.jpeg */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="rounded-3xl bg-slate-50 border border-slate-200/70 p-8 flex flex-col justify-between hover:shadow-xl transition-all duration-300 group">
              <div>
                <div className="h-10 w-10 rounded-xl bg-[#D4F754] flex items-center justify-center text-slate-950 mb-6 group-hover:scale-110 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">Thematic Baskets</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Diversified index baskets minted in a single Solana signature. Equal-weighted exposure to Magnificent 7 Tech, AI Pioneers, and Green Energy.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-blue-600">
                <span>Explore Baskets</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Feature 2 */}
            <div className="rounded-3xl bg-slate-50 border border-slate-200/70 p-8 flex flex-col justify-between hover:shadow-xl transition-all duration-300 group">
              <div>
                <div className="h-10 w-10 rounded-xl bg-[#D4F754] flex items-center justify-center text-slate-950 mb-6 group-hover:scale-110 transition-transform">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">Automated SIPs</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Dollar-cost-averaging schedules without losing custody. Recurring USDC routing via Jupiter with custom slippage protection.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-blue-600">
                <span>Start Recurring SIP</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Feature 3 with Team photo thumbnail */}
            <div className="rounded-3xl bg-slate-50 border border-slate-200/70 p-8 flex flex-col justify-between hover:shadow-xl transition-all duration-300 group">
              <div>
                <div className="h-10 w-10 rounded-xl bg-[#D4F754] flex items-center justify-center text-slate-950 mb-6 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">Data & Pyth Insights</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Sub-second live prices from Pyth Network. Sentiment intelligence scored from breaking headlines, options vol, and onchain flow.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-blue-600">
                <span>View Live Feeds</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. INTERACTIVE SIP & ROI CALCULATOR */}
      <section id="calculator" className="py-20 bg-gradient-to-b from-slate-50 to-white border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-2 block">
              • Interactive Wealth Simulator
            </span>
            <h2 className="text-3xl font-bold text-slate-950">See How Your Solana SIP Compounds</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-2">
              Calculate projected returns with 0% management fees and automated non-custodial rebalancing.
            </p>
          </div>

          <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-2xl grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            {/* Controls */}
            <div className="md:col-span-7 space-y-6">
              {/* Basket selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">Target Asset / Basket</label>
                <div className="grid grid-cols-2 gap-2">
                  {POPULAR_BASKETS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBasketId(b.id)}
                      className={`p-3 rounded-xl text-left border text-xs font-semibold transition ${
                        selectedBasketId === b.id
                          ? 'border-[#00D09C] bg-emerald-50/50 text-emerald-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <span className="block text-sm font-bold text-slate-900">{b.ticker}</span>
                      <span className="text-[11px] text-emerald-600 font-mono">+{b.return1Y}% 1Y</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Monthly Amount Slider */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-2">
                  <span>Monthly Investment</span>
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
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>$50</span>
                  <span>$1,000</span>
                  <span>$2,000</span>
                </div>
              </div>

              {/* Duration Slider */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-2">
                  <span>Time Horizon</span>
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
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>1 Year</span>
                  <span>5 Years</span>
                  <span>10 Years</span>
                </div>
              </div>
            </div>

            {/* Results Display */}
            <div className="md:col-span-5 bg-slate-950 text-white rounded-2xl p-6 shadow-xl space-y-4">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
                Projected Value
              </span>
              <div className="text-3xl sm:text-4xl font-bold font-mono text-[#D4F754]">
                ${futureValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-800 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Total Amount Invested:</span>
                  <span className="font-mono text-white font-semibold">
                    ${totalInvested.toLocaleString('en-US')}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Estimated Capital Gains:</span>
                  <span className="font-mono text-[#00D09C] font-semibold">
                    +${estimatedProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Solana Custody:</span>
                  <span className="font-mono text-white font-semibold">100% Non-Custodial</span>
                </div>
              </div>

              <Link
                href="/app"
                className="w-full mt-4 py-3 rounded-xl bg-[#00D09C] hover:bg-[#00e2ab] text-slate-950 font-bold text-xs uppercase tracking-wider block text-center shadow-lg transition"
              >
                Start This SIP on Kite
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 6. CALL TO ACTION BANNER */}
      <section className="py-16 bg-slate-950 text-white relative overflow-hidden">
        <div className="mx-auto max-w-5xl px-4 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to experience Wall Street on Solana?
          </h2>
          <p className="mt-3 text-sm text-slate-400 max-w-xl mx-auto">
            Connect your Phantom, Solflare, or Seed Vault in one click. Trade tokenized stocks and automated baskets with zero KYC bottlenecks.
          </p>

          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#D4F754] text-slate-950 font-bold text-xs uppercase tracking-wider shadow-2xl hover:scale-105 transition"
            >
              <span>Launch Groww Web App</span>
              <ArrowUpRight className="w-4 h-4 text-slate-950 stroke-[3]" />
            </Link>
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-12 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-slate-950 flex items-center justify-center text-white">
              <Mark className="h-4 w-4 text-[#00D09C]" />
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight">kite</span>
            <span className="text-slate-400">· Solana Tokenized Equities Hackathon</span>
          </div>

          <div className="flex items-center space-x-6 text-slate-600">
            <Link href="/app" className="hover:text-slate-900 transition">Markets</Link>
            <Link href="/app" className="hover:text-slate-900 transition">Baskets</Link>
            <Link href="/app" className="hover:text-slate-900 transition">SIP Engine</Link>
            <Link href="/portfolio" className="hover:text-slate-900 transition">Portfolio</Link>
            <a href="https://solana.com" target="_blank" rel="noreferrer" className="hover:text-slate-900 transition">Solana</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
