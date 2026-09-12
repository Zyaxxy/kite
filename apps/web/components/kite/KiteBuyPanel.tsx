'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { ShieldCheck, CheckCircle2, Zap, X, Loader2 } from 'lucide-react';

interface KiteBuyPanelProps {
  targetName?: string;
  targetSymbol?: string;
  targetPrice?: number;
  targetChange?: number;
  onClose: () => void;
}

export function KiteBuyPanel({
  targetName,
  targetSymbol,
  targetPrice,
  targetChange,
  onClose,
}: KiteBuyPanelProps) {
  const { connected } = useWallet();
  const [amountUsdc, setAmountUsdc] = useState<string>('100');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);

  if (!targetName || !targetSymbol || targetPrice === undefined) {
    return (
      <aside className="w-full bg-raised border border-line rounded-xl p-6 text-center text-muted sticky top-20 shadow-sm space-y-2">
        <p className="text-xs">Select any tokenized stock or basket to view live order routing.</p>
        <span className="text-[11px] font-mono text-muted/60 block">Non-custodial 0% fee execution</span>
      </aside>
    );
  }

  const isUp = (targetChange || 0) >= 0;
  const numUsdc = parseFloat(amountUsdc) || 0;
  const receiveAmount = numUsdc > 0 && targetPrice > 0 ? (numUsdc / targetPrice).toFixed(4) : '0.0000';

  const handleMint = async () => {
    if (numUsdc <= 0) return;
    setIsSubmitting(true);
    setTxResult(null);

    // Simulated Jupiter atomic multi-leg routing on Solana Devnet
    setTimeout(() => {
      setIsSubmitting(false);
      setTxResult(`Minted ${receiveAmount} ${targetSymbol} for $${numUsdc.toFixed(2)} USDC`);
      setTimeout(() => setTxResult(null), 5000);
    }, 1200);
  };

  return (
    <aside className="w-full bg-raised border border-line rounded-xl p-5 sticky top-20 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start border-b border-line pb-3">
        <div>
          <h3 className="text-base font-bold text-ink leading-tight">{targetName}</h3>
          <div className="text-xs text-muted font-mono mt-0.5">{targetSymbol} · Solana SPL</div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-ink p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Price Strip */}
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold font-mono text-ink">${targetPrice.toFixed(2)}</span>
        <span className={`font-mono text-xs font-semibold ${isUp ? 'text-up' : 'text-down'}`}>
          {isUp ? '+' : ''}{targetChange?.toFixed(2)}%
        </span>
      </div>

      {/* Input Field */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted">
          <label htmlFor="usdc-amount">Amount in USDC</label>
          <span className="font-mono text-ink">Balance: 1,000.00</span>
        </div>
        <div className="relative">
          <input
            id="usdc-amount"
            type="number"
            min="1"
            step="any"
            value={amountUsdc}
            onChange={(e) => setAmountUsdc(e.target.value)}
            className="w-full bg-bg border border-line rounded-lg p-3 text-ink font-mono text-sm focus:border-accent outline-none"
            placeholder="100.00"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold text-muted">
            USDC
          </span>
        </div>

        <div className="flex justify-between text-xs text-muted pt-1">
          <span>Estimated Output:</span>
          <span className="font-mono text-ink font-semibold">~{receiveAmount} {targetSymbol}</span>
        </div>
      </div>

      {/* Preset Pills */}
      <div className="flex gap-2">
        {['50', '100', '250', '500'].map((preset) => (
          <button
            key={preset}
            onClick={() => setAmountUsdc(preset)}
            className={`flex-1 py-1 rounded text-xs font-mono transition-colors border ${
              amountUsdc === preset
                ? 'bg-bg border-accent text-accent'
                : 'bg-bg border-line text-muted hover:text-ink'
            }`}
          >
            ${preset}
          </button>
        ))}
      </div>

      {/* Feedback Alert */}
      {txResult && (
        <div className="p-3 bg-emerald-500/10 border border-up/30 text-up rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{txResult}</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleMint}
        disabled={isSubmitting || numUsdc <= 0}
        className="w-full py-3 rounded-lg bg-accent text-accent-ink font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 shadow-sm"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Routing via Jupiter...</span>
          </>
        ) : (
          `Mint ${targetSymbol}`
        )}
      </button>

      {/* Security & Protocol Badges */}
      <div className="pt-2 border-t border-line flex items-center justify-between text-[11px] text-muted font-mono">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" /> Non-custodial PDA
        </span>
        <span className="flex items-center gap-1">
          <Zap className="w-3.5 h-3.5 text-amber-400" /> 0% Protocol Fee
        </span>
      </div>
    </aside>
  );
}
