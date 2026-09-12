'use client';

import React, { useState } from 'react';
import { SIP_PRESETS, KITE_BASKETS, KITE_STOCKS, ActiveSIP } from '../../lib/kite-data';
import { Calendar, Plus, Pause, Play, CheckCircle2, ShieldCheck, X } from 'lucide-react';

interface KiteSIPsProps {
  onStartNewSIP?: () => void;
  prefillSymbol?: string;
}

export function KiteSIPs({ onStartNewSIP, prefillSymbol }: KiteSIPsProps) {
  const [sips, setSips] = useState<ActiveSIP[]>(SIP_PRESETS);
  const [isModalOpen, setIsModalOpen] = useState(Boolean(prefillSymbol));
  const [target, setTarget] = useState(prefillSymbol || 'SOL-MAG7');
  const [amount, setAmount] = useState('100');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [feedback, setFeedback] = useState<string | null>(null);

  const allTargets = [
    ...KITE_BASKETS.map((b) => ({ symbol: b.ticker, name: `${b.name} (${b.ticker})` })),
    ...KITE_STOCKS.map((s) => ({ symbol: s.symbol, name: `${s.name} (${s.symbol})` })),
  ];

  const handleTogglePause = (id: string) => {
    setSips((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const nextStatus = s.status === 'active' ? 'paused' : 'active';
          setFeedback(`SIP for ${s.name} is now ${nextStatus}.`);
          setTimeout(() => setFeedback(null), 3000);
          return { ...s, status: nextStatus };
        }
        return s;
      })
    );
  };

  const handleCreateSIP = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmt = parseFloat(amount) || 50;
    const selectedTarget = allTargets.find((t) => t.symbol === target);
    const targetName = selectedTarget ? selectedTarget.name : target;

    const newSip: ActiveSIP = {
      id: `sip-${Date.now()}`,
      name: targetName,
      targetTicker: target,
      amountUsdc: parsedAmt,
      frequency,
      nextDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'active',
    };

    setSips([newSip, ...sips]);
    setIsModalOpen(false);
    setFeedback(`Automated ${frequency} SIP of $${parsedAmt} USDC scheduled via Jupiter.`);
    setTimeout(() => setFeedback(null), 4000);
  };

  const totalMonthly = sips
    .filter((s) => s.status === 'active')
    .reduce((acc, s) => {
      const mult = s.frequency === 'daily' ? 30 : s.frequency === 'weekly' ? 4 : 1;
      return acc + s.amountUsdc * mult;
    }, 0);

  return (
    <div className="flex flex-col space-y-6">
      {/* Monthly Summary & CTA */}
      <div className="bg-raised border border-line rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs text-muted block mb-1">Monthly Committed SIP Volume</span>
          <div className="text-3xl font-bold font-mono text-ink tracking-tight">
            ${totalMonthly.toLocaleString('en-US')} <span className="text-xs text-muted font-normal">USDC / month</span>
          </div>
          <p className="text-xs text-muted mt-1">
            Automated multi-leg swaps executed non-custodially via Jupiter on Solana.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-accent-ink hover:opacity-90 font-bold text-xs transition-opacity shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New SIP Mandate</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-500/10 border border-up/30 text-up rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* SIP List Table */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold text-ink tracking-tight">Active Schedules ({sips.length})</h2>
          <span className="text-xs text-muted font-mono">0% protocol fee</span>
        </div>

        <div className="border border-line rounded-xl overflow-hidden bg-raised shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-muted bg-bg/50">
                  <th className="py-3 px-4 font-semibold">Target Asset</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount (USDC)</th>
                  <th className="py-3 px-4 font-semibold text-center">Frequency</th>
                  <th className="py-3 px-4 font-semibold text-center">Next Execution</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sips.map((sip) => {
                  const isActive = sip.status === 'active';
                  return (
                    <tr key={sip.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded bg-bg border border-line flex items-center justify-center font-bold text-ink text-[11px] font-mono">
                            {sip.targetTicker.slice(0, 3)}
                          </div>
                          <div>
                            <span className="font-bold text-ink block">{sip.name}</span>
                            <span className="text-[11px] text-muted font-mono">{sip.targetTicker}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-ink">
                        ${sip.amountUsdc.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-center capitalize text-muted font-medium">
                        {sip.frequency}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono text-muted">
                        {sip.nextDate}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            isActive
                              ? 'bg-emerald-500/10 text-up border border-up/30'
                              : 'bg-muted/10 text-muted border border-line'
                          }`}
                        >
                          {sip.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleTogglePause(sip.id)}
                          className="px-2.5 py-1 rounded bg-bg hover:bg-white/10 border border-line text-[11px] font-semibold text-ink transition-colors"
                        >
                          {isActive ? 'Pause' : 'Resume'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3-Field New SIP Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-raised border border-line rounded-xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-accent" />
                <h3 className="text-base font-bold text-ink">Schedule Non-Custodial SIP</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted hover:text-ink p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSIP} className="space-y-4 text-xs">
              {/* Field 1: Target Asset */}
              <div>
                <label className="text-muted block mb-1 font-semibold">1. Select Stock or Basket</label>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="w-full bg-bg border border-line rounded-lg p-2.5 text-ink focus:border-accent outline-none"
                  required
                >
                  <optgroup label="Thematic Baskets">
                    {KITE_BASKETS.map((b) => (
                      <option key={b.id} value={b.ticker}>
                        {b.name} ({b.ticker})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Tokenized US Stocks">
                    {KITE_STOCKS.map((s) => (
                      <option key={s.symbol} value={s.symbol}>
                        {s.name} ({s.symbol})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Field 2: Amount (USDC) */}
              <div>
                <label className="text-muted block mb-1 font-semibold">2. Recurring Amount (USDC)</label>
                <input
                  type="number"
                  min="10"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-bg border border-line rounded-lg p-2.5 text-ink font-mono focus:border-accent outline-none"
                  placeholder="100"
                  required
                />
              </div>

              {/* Field 3: Frequency */}
              <div>
                <label className="text-muted block mb-1 font-semibold">3. Frequency</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['daily', 'weekly', 'monthly'] as const).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setFrequency(freq)}
                      className={`py-2 rounded-lg font-semibold capitalize transition-colors ${
                        frequency === freq
                          ? 'bg-accent text-accent-ink'
                          : 'bg-bg border border-line text-muted hover:text-ink'
                      }`}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 rounded-lg bg-accent hover:opacity-90 text-accent-ink font-bold text-xs transition-opacity shadow-sm"
                >
                  Authorize SIP on Solana
                </button>
              </div>

              <p className="text-[11px] text-muted text-center flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                Zero lockup. Cancel or pause anytime from your wallet.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
