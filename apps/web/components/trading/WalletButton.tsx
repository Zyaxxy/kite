'use client';
import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(() => import('@solana/wallet-adapter-react-ui').then(module => module.WalletMultiButton), {
  ssr: false,
  loading: () => <button className="btn secondary" disabled>Loading wallet…</button>,
});

export function WalletButton() { return <div className="wallet-button-container"><WalletMultiButton /></div>; }
