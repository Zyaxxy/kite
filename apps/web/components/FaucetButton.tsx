'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Droplet, CheckCircle2, AlertCircle } from 'lucide-react';

export function FaucetButton() {
  const { publicKey, connected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestFaucet = async () => {
    if (!publicKey) return;
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Airdrop failed');

      setMessage('+$1,000 USDC & 5 xNVDA sent!');
      setTimeout(() => setMessage(null), 6000);
    } catch (err: any) {
      setError(err.message || 'Failed to claim faucet');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  if (!connected) return null;

  return (
    <div className="relative flex items-center">
      <button
        onClick={requestFaucet}
        disabled={loading}
        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
          loading
            ? 'bg-blue-600/30 border-blue-500/30 text-blue-300 cursor-wait'
            : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
        }`}
      >
        <Droplet className="w-3.5 h-3.5" />
        <span>{loading ? 'Minting Devnet Funds...' : 'Devnet Faucet'}</span>
      </button>

      {message && (
        <div className="absolute right-0 top-10 whitespace-nowrap bg-emerald-950 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 shadow-xl z-50 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="absolute right-0 top-10 whitespace-nowrap bg-rose-950 border border-rose-500/40 text-rose-300 px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 shadow-xl z-50 animate-fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
