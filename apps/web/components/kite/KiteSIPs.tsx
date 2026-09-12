'use client';

import React, { useState } from 'react';
import { usePaperTrading } from '../../lib/usePaperTrading';
import type { QuoteData } from '../../lib/market-types';
import { CURATED_BASKETS } from '@kite/sdk';
import {
  Repeat,
  TrendingUp,
  PiggyBank,
  CheckCircle2,
  Play,
  Plus,
  History,
  ShieldCheck,
  Calendar,
  Zap,
} from 'lucide-react';

interface KiteSIPsProps {
  prefillSymbol?: string;
  quotes?: Record<string, QuoteData>;
}

export function KiteSIPs({ prefillSymbol, quotes }: KiteSIPsProps) {
  const { sips, toggleSip, executeSipCycle, createSip, cashBalance } = usePaperTrading(quotes);

  const [selectedTarget, setSelectedTarget] = useState<string>(prefillSymbol || 'dAI-TITAN');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'bi-weekly' | 'monthly'>('weekly');
  const [amountInput, setAmountInput] = useState<number>(100);
  const [activeTab, setActiveTab] = useState<'plans' | 'ledger'>('plans');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const targets = [
    { symbol: 'dAI-TITAN', name: 'AI Infrastructure Titans', isBasket: true },
    { symbol: 'MAG7', name: 'Magnificent 7 Tech', isBasket: true },
    { symbol: 'xNVDA', name: 'Nvidia Corp.', isBasket: false },
    { symbol: 'xAAPL', name: 'Apple Inc.', isBasket: false },
    { symbol: 'xMSFT', name: 'Microsoft Corp.', isBasket: false },
    { symbol: 'xTSLA', name: 'Tesla Inc.', isBasket: false },
  ];

  const handleCreateNewSip = (e: React.FormEvent) => {
    e.preventDefault();
    const item = targets.find((t) => t.symbol === selectedTarget) || targets[0];
    const res = createSip(item.symbol, item.name, amountInput, frequency, item.isBasket);
    setFeedbackMsg(res.message);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleExecuteCycleNow = (sipId: string, symbol: string) => {
    const raw = symbol.replace(/^x/, '').replace(/^pre/, '');
    const q = quotes ? (quotes[raw] || quotes[symbol]) : undefined;
    const price = q?.price || 114.20;
    const res = executeSipCycle(sipId, price);
    setFeedbackMsg(res.message);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Compute metrics
  const activeSipsCount = sips.filter((s) => s.status === 'active').length;
  const monthlyCommitment = sips
    .filter((s) => s.status === 'active')
    .reduce((acc, s) => {
      const mult = s.frequency === 'daily' ? 30 : s.frequency === 'weekly' ? 4 : s.frequency === 'bi-weekly' ? 2 : 1;
      return acc + s.amountUsdc * mult;
    }, 0);

  const totalAccumulated = sips.reduce((acc, s) => acc + s.totalInvested, 0);

  return (
    <div className="space-y-7">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-text-muted uppercase tracking-wider">
            <span>Non-Custodial DCA Engine</span>
            <span>•</span>
            <span className="text-bull-green flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-bull-green animate-pulse" />
              Streaming Protocol Active
            </span>
          </div>
          <div className="flex items-baseline gap-2.5 mt-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
              Automated SIP Accumulator
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-surface-card-elevated text-text-secondary border border-border-subtle">
              SPL-Token DCA v2
            </span>
          </div>
        </div>

        {/* Header Action Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('plans')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold font-display transition-colors ${
              activeTab === 'plans'
                ? 'bg-surface-card-elevated text-bull-green border border-bull-green/30'
                : 'bg-surface-card text-text-secondary hover:text-white border border-border-subtle'
            }`}
          >
            Active Schedules
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold font-display transition-colors flex items-center gap-1.5 ${
              activeTab === 'ledger'
                ? 'bg-surface-card-elevated text-bull-green border border-bull-green/30'
                : 'bg-surface-card text-text-secondary hover:text-white border border-border-subtle'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Execution Ledger</span>
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="bg-bull-green-subtle border border-bull-green/40 text-bull-green px-4 py-3 rounded-xl text-xs font-mono flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Top 4 Bento Metric Cards (Stitch High-Precision Spec) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Monthly SIP Commitment</span>
          <p className="font-mono text-xl sm:text-2xl font-bold text-text-primary tabular-nums">
            ${monthlyCommitment.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] font-mono text-bull-green flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Recurring onchain
          </span>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Active Recurring Plans</span>
          <p className="font-mono text-xl sm:text-2xl font-bold text-text-primary tabular-nums">
            {activeSipsCount} Running
          </p>
          <span className="text-[11px] font-mono text-bull-green flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> All healthy • 0 failed debits
          </span>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Total Accumulated</span>
          <p className="font-mono text-xl sm:text-2xl font-bold text-text-primary tabular-nums">
            ${totalAccumulated.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] font-mono text-bull-green flex items-center gap-1">
            <PiggyBank className="w-3 h-3" /> DCA Wealth Engine
          </span>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-sm space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Weighted SIP XIRR</span>
          <p className="font-mono text-xl sm:text-2xl font-bold text-bull-green tabular-nums">
            +24.8%
          </p>
          <span className="text-[11px] font-mono text-text-muted">
            vs +14.2% Lump Sum Baseline
          </span>
        </div>
      </div>

      {/* Main Dual-Column Layout (7 cols Schedules / 5 cols Creator) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Active Schedules or Ledger */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-base text-text-primary">
              {activeTab === 'plans' ? 'Active Recurring SIP Schedules' : 'Historical Execution Ledger'}
            </h2>
            <span className="text-xs font-mono text-text-muted">
              {sips.length} Plans Configured
            </span>
          </div>

          {activeTab === 'plans' ? (
            <div className="space-y-3.5">
              {sips.map((sip) => (
                <div
                  key={sip.id}
                  className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-sm hover:shadow-md transition-all space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-surface-card-elevated border border-border-interactive flex items-center justify-center font-bold text-bull-green font-mono text-sm shadow-inner">
                        {sip.targetSymbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-bold text-sm text-text-primary">{sip.targetName}</h3>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-bull-green-subtle text-bull-green">
                            {sip.targetSymbol}
                          </span>
                        </div>
                        <span className="text-xs text-text-muted font-mono">
                          {sip.frequency.toUpperCase()} • {sip.nextExecution}
                        </span>
                      </div>
                    </div>

                    {/* Toggle Active / Pause Status */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSip(sip.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold transition-colors ${
                          sip.status === 'active'
                            ? 'bg-bull-green-subtle text-bull-green border border-bull-green/30'
                            : 'bg-surface-overlay text-text-muted border border-border-subtle'
                        }`}
                      >
                        {sip.status.toUpperCase()}
                      </button>
                    </div>
                  </div>

                  {/* Schedule Metrics Strip */}
                  <div className="grid grid-cols-3 gap-3 bg-surface-base/60 rounded-lg p-3 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-text-muted uppercase block">Cycle Amount</span>
                      <span className="font-bold text-text-primary tabular-nums">${sip.amountUsdc.toFixed(2)} USDC</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-muted uppercase block">Total Invested</span>
                      <span className="font-bold text-text-primary tabular-nums">${sip.totalInvested.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-muted uppercase block">Cycles Filled</span>
                      <span className="font-bold text-bull-green tabular-nums">{sip.cyclesCompleted}</span>
                    </div>
                  </div>

                  {/* Instant Demo Execution Trigger */}
                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-text-muted">
                      Solana Non-Custodial Stream #412
                    </span>
                    <button
                      onClick={() => handleExecuteCycleNow(sip.id, sip.targetSymbol)}
                      className="px-3 py-1.5 rounded-lg bg-surface-card-elevated hover:bg-bull-green hover:text-surface-base border border-border-interactive text-xs font-semibold text-text-primary transition-all flex items-center gap-1.5 font-display"
                    >
                      <Play className="w-3 h-3 text-bull-green" />
                      <span>Execute Cycle Now (Demo)</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Execution Ledger Table */
            <div className="bg-surface-card border border-border-subtle rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-border-subtle/50 text-xs font-mono text-text-muted">
                Recent Onchain DCA Program Transactions
              </div>
              <div className="divide-y divide-border-subtle/40 text-xs font-mono">
                <div className="p-3.5 flex items-center justify-between text-text-secondary">
                  <div>
                    <span className="font-bold text-text-primary">dAI-TITAN</span>
                    <span className="text-text-muted ml-2">Cycle #6 Filled</span>
                  </div>
                  <span className="text-bull-green font-bold">+$250.00 USDC</span>
                  <span className="text-text-muted text-[11px]">Today 14:00 UTC</span>
                </div>
                <div className="p-3.5 flex items-center justify-between text-text-secondary">
                  <div>
                    <span className="font-bold text-text-primary">xNVDA</span>
                    <span className="text-text-muted ml-2">Cycle #24 Filled</span>
                  </div>
                  <span className="text-bull-green font-bold">+$100.00 USDC</span>
                  <span className="text-text-muted text-[11px]">3 days ago</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right 5 Columns: New SIP Schedule Creator Panel */}
        <div className="lg:col-span-5 sticky top-24 bg-surface-card-elevated border border-border-interactive rounded-2xl p-6 shadow-xl space-y-5">
          <div>
            <span className="text-[10px] font-mono uppercase text-bull-green tracking-wider font-semibold">
              Instant Scheduling
            </span>
            <h3 className="font-display text-lg font-bold text-text-primary mt-0.5">
              New Automated SIP Plan
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Automate weekly dollar-cost averaging into tokenized US equities with zero management fees.
            </p>
          </div>

          <form onSubmit={handleCreateNewSip} className="space-y-4">
            {/* Target Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-text-secondary">
                Select Asset or Thematic Basket
              </label>
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="w-full bg-surface-base border border-border-subtle focus:border-bull-green rounded-lg px-3 py-2.5 text-xs text-text-primary outline-none transition-colors"
              >
                {targets.map((t) => (
                  <option key={t.symbol} value={t.symbol} className="bg-surface-card text-text-primary">
                    {t.name} ({t.symbol})
                  </option>
                ))}
              </select>
            </div>

            {/* Recurrence Frequency */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-text-secondary">
                Recurrence Frequency
              </label>
              <div className="grid grid-cols-4 gap-1.5 bg-surface-base p-1 rounded-lg">
                {(['daily', 'weekly', 'bi-weekly', 'monthly'] as const).map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setFrequency(freq)}
                    className={`py-1.5 rounded text-[11px] font-mono font-semibold capitalize transition-all ${
                      frequency === freq
                        ? 'bg-surface-overlay text-bull-green shadow-sm'
                        : 'text-text-muted hover:text-white'
                    }`}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>

            {/* Recurring Amount in USDC */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-text-secondary">Recurring Cycle Amount</label>
                <span className="font-mono text-text-muted">Balance: ${cashBalance.toFixed(2)}</span>
              </div>
              <div className="flex items-center bg-surface-base border border-border-subtle focus-within:border-bull-green rounded-lg px-3 py-2 transition-colors">
                <span className="font-mono text-sm font-bold text-text-muted mr-1">$</span>
                <input
                  type="number"
                  min="10"
                  max="10000"
                  value={amountInput}
                  onChange={(e) => setAmountInput(Number(e.target.value))}
                  className="w-full bg-transparent font-mono text-sm font-bold text-text-primary outline-none"
                  required
                />
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-surface-overlay text-bull-green">
                  USDC
                </span>
              </div>

              {/* Amount Presets */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[50, 100, 250, 500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmountInput(amt)}
                    className={`py-1 rounded text-xs font-mono font-medium transition-colors ${
                      amountInput === amt
                        ? 'bg-surface-overlay text-bull-green border border-bull-green/30'
                        : 'bg-surface-base text-text-muted hover:text-text-primary'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Projected Wealth Accumulation */}
            <div className="bg-surface-base/70 border border-border-subtle/60 rounded-xl p-3 text-xs font-mono space-y-1.5">
              <div className="flex items-center justify-between text-text-secondary">
                <span>Estimated 1Y Investment:</span>
                <span className="text-text-primary font-bold">
                  ${(amountInput * (frequency === 'weekly' ? 52 : frequency === 'daily' ? 365 : 12)).toLocaleString()} USDC
                </span>
              </div>
              <div className="flex items-center justify-between text-text-secondary">
                <span>Historical 1Y Return:</span>
                <span className="text-bull-green font-bold">+28.4% (CAGR)</span>
              </div>
              <div className="flex items-center justify-between text-text-secondary">
                <span>Protocol Fee:</span>
                <span className="text-bull-green font-bold">0.00% Zero Fee</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-bull-green hover:brightness-110 active:scale-95 text-surface-base font-display font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(0,208,156,0.35)]"
            >
              <Repeat className="w-4 h-4" />
              <span>Activate Automated SIP Schedule</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
