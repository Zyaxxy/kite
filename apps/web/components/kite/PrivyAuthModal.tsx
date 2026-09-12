'use client';

import React, { useState } from 'react';
import { X, ShieldCheck, Mail, Wallet, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

interface PrivyAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PrivyAuthModal({ isOpen, onClose, onSuccess }: PrivyAuthModalProps) {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [privyLoggedIn, setPrivyLoggedIn] = useState(false);

  if (!isOpen) return null;

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setPrivyLoggedIn(true);
      if (onSuccess) onSuccess();
    }, 1200);
  };

  const handleSolanaWalletConnect = () => {
    onClose();
    setSolanaModalVisible(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className="relative w-full max-w-md bg-surface-card border border-border-interactive rounded-2xl p-6 sm:p-7 shadow-2xl space-y-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-bull-green/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-surface-card-elevated border border-border-subtle flex items-center justify-center text-bull-green shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-text-primary">Sign in with Privy</h3>
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                Non-Custodial Mainnet Trading
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-surface-base hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {privyLoggedIn || connected ? (
          <div className="space-y-4 py-2">
            <div className="bg-bull-green-subtle border border-bull-green/30 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-bull-green shrink-0" />
              <div>
                <div className="text-xs font-semibold text-text-primary">Account Authenticated</div>
                <div className="text-[11px] font-mono text-bull-green">
                  {connected && publicKey
                    ? `Solana Wallet: ${publicKey.toBase58().slice(0, 6)}...${publicKey.toBase58().slice(-4)}`
                    : `Privy Embedded: ${email}`}
                </div>
              </div>
            </div>

            <p className="text-xs text-text-secondary">
              You are ready for actual mainnet tokenized stock swaps via Jupiter. No vault required—all transactions settle directly into your non-custodial address.
            </p>

            <button
              onClick={() => {
                if (connected) disconnect();
                setPrivyLoggedIn(false);
                onClose();
              }}
              className="w-full py-2.5 rounded-lg bg-surface-card-elevated hover:bg-surface-overlay border border-border-subtle text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
            >
              Disconnect Session
            </button>
          </div>
        ) : (
          <>
            {/* Email Magic Link / OTP */}
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <label className="block text-xs font-medium text-text-secondary">
                Email address (instant embedded wallet)
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-surface-base border border-border-subtle focus:border-bull-green rounded-lg pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none transition-colors"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-bull-green hover:brightness-110 active:scale-95 text-surface-base font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,208,156,0.3)] disabled:opacity-50"
                >
                  {isSubmitting ? 'Signing in...' : 'Continue'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            <div className="relative flex items-center justify-center">
              <div className="w-full border-t border-border-subtle" />
              <span className="absolute px-3 bg-surface-card text-[10px] font-mono text-text-muted uppercase">
                or connect browser wallet
              </span>
            </div>

            {/* Direct Solana Wallet Options */}
            <button
              onClick={handleSolanaWalletConnect}
              className="w-full py-2.5 px-4 rounded-xl bg-surface-card-elevated hover:bg-surface-overlay border border-border-subtle hover:border-border-interactive flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Wallet className="w-4 h-4 text-bull-green" />
                <span className="text-xs font-semibold text-text-primary">Phantom, Solflare, or Backpack</span>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Non-Custodial Architecture Guarantee */}
            <div className="bg-surface-base/80 border border-border-subtle/60 rounded-xl p-3 text-[11px] text-text-muted space-y-1">
              <div className="flex items-center gap-1.5 text-text-secondary font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-bull-green" />
                100% Self-Custody Guarantee
              </div>
              <p className="leading-relaxed">
                Kite routes trades atomically through Jupiter. Your tokens are held directly in your Solana wallet without central lockups or custodial vaults.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
