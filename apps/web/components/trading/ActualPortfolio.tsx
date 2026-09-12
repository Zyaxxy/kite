'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MainnetPortfolio } from '@kite/sdk';
import { useTradingAuth } from './TradingAuth';
import { WalletButton } from './WalletButton';

const usd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export function ActualPortfolio() {
  const auth = useTradingAuth();
  const [portfolio, setPortfolio] = useState<MainnetPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setPortfolio(null); setError(null);
    if (!auth.walletAddress) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/portfolio?wallet=${encodeURIComponent(auth.walletAddress)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Wallet balances are unavailable.'); return data as MainnetPortfolio; })
      .then(setPortfolio)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Wallet balances are unavailable.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [auth.walletAddress, revision]);

  if (!auth.walletAddress) return <section className="panel empty-state"><h2>Your wallet, your assets.</h2><p>Sign in with Privy or connect your wallet to see your actual mainnet holdings.</p><button className="btn" disabled={!auth.configured || !auth.ready} onClick={auth.login}>Sign in with Privy</button>{!auth.configured && <p className="fineprint">Privy sign-in is not configured for this deployment.</p>}<WalletButton /></section>;

  return <section className="actual-portfolio">
    <div className="section-heading"><div><h2>Actual holdings</h2><p className="fineprint">{auth.walletAddress.slice(0, 6)}…{auth.walletAddress.slice(-4)} · Solana mainnet</p></div><button className="btn secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? 'Refreshing…' : 'Refresh balances'}</button></div>
    {loading && <p role="status" className="notice">Reading your mainnet wallet balances…</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {portfolio && <>
      <div className="metric-grid">
        <article className="panel"><p className="eyebrow">Tokenized holdings value</p><h2>{portfolio.hasUnpricedHoldings ? 'Unavailable' : usd(portfolio.pricedHoldingsValueUsd)}</h2>{portfolio.hasUnpricedHoldings && <p className="fineprint">Some prices or corporate-action adjustments are not verified. Verified subtotal: {usd(portfolio.pricedHoldingsValueUsd)}.</p>}</article>
        <article className="panel"><p className="eyebrow">USDC available</p><h2>{portfolio.usdcBalance}</h2><p className="fineprint">In your wallet</p></article>
        <article className="panel"><p className="eyebrow">SOL for fees</p><h2>{portfolio.solBalance}</h2><p className="fineprint">In your wallet</p></article>
      </div>
      {portfolio.holdings.length === 0 ? <div className="panel empty-state"><h3>No supported tokenized assets in this wallet.</h3><p>Explore issuer-listed xStocks and PreStocks to find an asset.</p><Link className="btn" href="/app">Explore assets</Link></div> : <div className="panel table-wrap"><table><thead><tr><th>Asset</th><th>Quantity</th><th>Price</th><th>Value</th><th /></tr></thead><tbody>{portfolio.holdings.map(holding => <tr key={holding.mint}><td><strong>{holding.symbol}</strong><p className="fineprint">{holding.name}</p></td><td>{holding.displayAmount ?? 'Unavailable'}<p className="fineprint">{holding.amount} raw units</p></td><td>{holding.priceUsd === null ? 'Unavailable' : usd(holding.priceUsd)}</td><td>{holding.valueUsd === null ? 'Unavailable' : usd(holding.valueUsd)}{holding.valuationUnavailableReason && <p className="fineprint">{holding.valuationUnavailableReason}</p>}</td><td><Link href={`/stock/${encodeURIComponent(holding.mint)}?mode=actual`}>Trade</Link></td></tr>)}</tbody></table></div>}
      <p className="fineprint">Balances observed {new Date(portfolio.observedAt).toLocaleTimeString()}. Cost basis and profit are not available from a wallet balance alone.</p>
    </>}
  </section>;
}
