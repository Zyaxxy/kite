'use client';

import React, { useState } from 'react';
import { usePaperTrading } from '../../lib/usePaperTrading';
import { Zap, Repeat, ShieldCheck, CheckCircle2, ChevronRight, ArrowRight } from 'lucide-react';

interface KiteBuyPanelProps {
  targetName?: string;
  targetSymbol?: string;
  targetPrice?: number;
  targetChange?: number;
  onClose?: () => void;
  tradingMode?: 'demo' | 'real';
}

export function KiteBuyPanel({
  targetName = 'AI Infrastructure Titans',
  targetSymbol = 'dAI-TITAN',
  targetPrice = 114.20,
  targetChange = 3.08,
  onClose,
  tradingMode = 'demo',
}: KiteBuyPanelProps) {
  const { cashBalance, buy, createSip } = usePaperTrading();
  const [mode, setMode] = useState<'lump' | 'sip'>('lump');
  const [amount, setAmount] = useState<number>(500);
  const [sipFrequency, setSipFrequency] = useState<'weekly' | 'bi-weekly' | 'monthly'>('weekly');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBasket = targetSymbol.includes('TITAN') || targetSymbol.includes('MAG7') || targetSymbol.includes('PRE');
  const safePrice = targetPrice > 0 ? targetPrice : 100;
  const estimatedUnits = (amount / safePrice).toFixed(3);

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      if (mode === 'lump') {
        const res = buy(targetSymbol, targetName, amount, safePrice, isBasket);
        setFeedback(res.message);
      } else {
        const res = createSip(targetSymbol, targetName, amount, sipFrequency, isBasket);
        setFeedback(res.message);
      }
      setIsSubmitting(false);
      setTimeout(() => setFeedback(null), 4000);
    }, 400);
  };

  return (
    <div className="sticky top-24 bg-surface-card-elevated border border-border-interactive rounded-2xl p-6 shadow-2xl space-y-5">
      {/* Execution Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-display font-bold text-base text-text-primary">
            {mode === 'lump' ? 'Invest in Asset' : 'Setup Automated SIP'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-text-secondary text-[11px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-bull-green" />
            Solana Live
          </span>
        </div>

        {/* Mode Segmented Control (Stitch spec) */}
        <div className="grid grid-cols-2 gap-1 bg-surface-base p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('lump')}
            className={`py-1.5 text-center font-mono text-xs font-semibold rounded-md transition-all ${
              mode === 'lump'
                ? 'bg-surface-overlay text-bull-green shadow-sm'
                : 'text-text-muted hover:text-white'
            }`}
          >
            Lump Sum
          </button>
          <button
            type="button"
            onClick={() => setMode('sip')}
            className={`py-1.5 text-center font-mono text-xs font-semibold rounded-md transition-all ${
              mode === 'sip'
                ? 'bg-surface-overlay text-bull-green shadow-sm'
                : 'text-text-muted hover:text-white'
            }`}
          >
            Automated SIP
          </button>
        </div>
      </div>

      {feedback && (
        <div className="bg-bull-green-subtle border border-bull-green/40 text-bull-green px-3.5 py-2.5 rounded-xl text-xs font-mono flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Target Asset Identity */}
      <div className="bg-surface-base/80 border border-border-subtle rounded-xl p-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-text-primary">{targetName}</div>
          <span className="text-[11px] font-mono text-bull-green">{targetSymbol}</span>
        </div>
        <div className="text-right font-mono">
          <span className="text-xs font-bold text-text-primary tabular-nums">${safePrice.toFixed(2)}</span>
          <span className="text-[10px] text-bull-green block tabular-nums">+{targetChange}%</span>
        </div>
      </div>

      <form onSubmit={handleExecute} className="space-y-4">
        {/* Wallet Balance Indicator */}
        <div className="flex items-center justify-between text-xs font-mono text-text-secondary">
          <span>Available Paper Balance</span>
          <span className="text-text-primary font-bold tabular-nums">${cashBalance.toFixed(2)} USDC</span>
        </div>

        {/* Input Container (Stitch spec) */}
        <div className="bg-surface-base rounded-xl p-3.5 space-y-1.5 border border-border-subtle focus-within:border-bull-green transition-colors">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-text-muted">
            <span>YOU PAY</span>
            <span>ESTIMATED RECEIVED</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <span className="font-mono text-lg font-bold text-text-primary">$</span>
              <input
                type="number"
                min="10"
                max={cashBalance}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-24 bg-transparent font-mono text-lg font-bold text-text-primary outline-none focus:text-bull-green transition-colors"
                required
              />
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-surface-overlay text-text-primary">
                USDC
              </span>
            </div>

            <div className="text-right">
              <div className="font-mono text-base font-bold text-text-primary tabular-nums">
                {estimatedUnits}
              </div>
              <span className="text-[10px] font-mono text-text-muted uppercase">{targetSymbol}</span>
            </div>
          </div>
        </div>

        {/* Preset Amount Selector Chips */}
        <div className="grid grid-cols-4 gap-1.5">
          {[100, 250, 500, 1000].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(preset)}
              className={`py-1 rounded text-xs font-mono font-medium transition-colors ${
                amount === preset
                  ? 'bg-surface-overlay text-bull-green border border-bull-green/30'
                  : 'bg-surface-base text-text-muted hover:text-white'
              }`}
            >
              ${preset}
            </button>
          ))}
        </div>

        {/* SIP Specific Controls */}
        {mode === 'sip' && (
          <div className="space-y-2 pt-1">
            <label className="block text-[11px] font-mono text-text-muted uppercase tracking-wider">
              DCA Recurrence Cadence
            </label>
            <div className="grid grid-cols-3 gap-1 bg-surface-base p-1 rounded-lg">
              {(['weekly', 'bi-weekly', 'monthly'] as const).map((cadence) => (
                <button
                  key={cadence}
                  type="button"
                  onClick={() => setSipFrequency(cadence)}
                  className={`py-1 rounded text-xs font-mono font-semibold capitalize transition-all ${
                    sipFrequency === cadence
                      ? 'bg-surface-overlay text-bull-green shadow-sm'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  {cadence}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Order Route & Execution Details (Stitch spec) */}
        <div className="space-y-1.5 text-xs font-mono bg-surface-base/60 p-3 rounded-xl text-text-muted border border-border-subtle/50">
          <div className="flex items-center justify-between">
            <span>Routing DEX</span>
            <span className="text-text-primary font-medium">Phoenix CLOB + Jupiter</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Price Slippage</span>
            <span className="text-bull-green font-medium">&lt; 0.01% Guaranteed</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Custody Fee</span>
            <span className="text-text-primary font-medium">0.00% Zero Fee</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Execution Latency</span>
            <span className="text-text-primary font-medium">~180ms L1</span>
          </div>
        </div>

        {/* Primary High-Contrast Execution CTA */}
        <button
          type="submit"
          disabled={isSubmitting || cashBalance < amount}
          className="w-full py-3 px-4 rounded-xl bg-bull-green hover:brightness-110 active:scale-[0.99] text-surface-base font-display font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_24px_rgba(0,208,156,0.35)] disabled:opacity-50"
        >
          {mode === 'lump' ? (
            <>
              <Zap className="w-4 h-4" />
              <span>
                {isSubmitting ? 'Processing Order...' : `Invest in ${targetSymbol} ($${amount} USDC)`}
              </span>
            </>
          ) : (
            <>
              <Repeat className="w-4 h-4" />
              <span>
                {isSubmitting ? 'Activating...' : `Activate ${sipFrequency} SIP ($${amount} USDC)`}
              </span>
            </>
          )}
        </button>

        {/* Mode Switch Helper */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setMode(mode === 'lump' ? 'sip' : 'lump')}
            className="text-bull-green hover:underline text-xs font-mono inline-flex items-center gap-1"
          >
            {mode === 'lump' ? (
              <>
                <Repeat className="w-3 h-3" />
                <span>Prefer Dollar-Cost Averaging? Setup Automated SIP</span>
              </>
            ) : (
              <>
                <Zap className="w-3 h-3" />
                <span>Switch to Instant Lump Sum Execution</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Trust Badges */}
      <div className="pt-2 border-t border-border-subtle/50 flex items-center justify-between text-[10px] font-mono text-text-muted">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-bull-green" /> 100% Non-Custodial
        </span>
        <span>•</span>
        <span>Zero Exit Fees</span>
        <span>•</span>
        <span>Instant Unwind</span>
      </div>
    </div>
  );
}
