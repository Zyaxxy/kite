'use client';

import React from 'react';
import Link from 'next/link';
import { MOCK_MARKET_INSIGHTS, CURATED_BASKETS } from '@kite/sdk';
import { SentimentBadge } from '../components/SentimentBadge';

function formatChange(change: number) {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

export default function HomePage() {
  const stocks = Object.values(MOCK_MARKET_INSIGHTS);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
      <section className="lg:col-span-8">
        <header className="mb-5">
          <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em]">Tokenized US stocks</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Pyth-priced SPL names. Buy a basket in one signature, or run a USDC SIP. Nothing leaves your wallet.
          </p>
        </header>

        <div className="overflow-x-auto border-y border-line">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-2.5 pr-3 font-medium">Name</th>
                <th className="py-2.5 pr-3 text-right font-medium">Last</th>
                <th className="py-2.5 pr-3 text-right font-medium">24h</th>
                <th className="py-2.5 pr-3 font-medium">Sentiment</th>
                <th className="py-2.5 font-medium">Catalyst</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => {
                const up = stock.change24h >= 0;
                return (
                  <tr key={stock.symbol} className="border-t border-line">
                    <td className="py-3.5 pr-3">
                      <Link href={`/stock/${stock.symbol.toLowerCase()}`} className="font-semibold hover:text-accent">
                        {stock.symbol}
                      </Link>
                    </td>
                    <td className="py-3.5 pr-3 text-right tabular-nums">${stock.price.toFixed(2)}</td>
                    <td className={`py-3.5 pr-3 text-right tabular-nums ${up ? 'text-up' : 'text-down'}`}>
                      {formatChange(stock.change24h)}
                    </td>
                    <td className="py-3.5 pr-3">
                      <SentimentBadge score={stock.sentimentScore} label={stock.sentimentLabel} />
                    </td>
                    <td className="max-w-[14rem] truncate py-3.5 text-muted">{stock.headlineNews[0]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="lg:col-span-4">
        <h2 className="mb-4 text-2xl font-semibold tracking-[-0.02em] lg:text-lg">Schemes</h2>
        <ul className="divide-y divide-line border-y border-line">
          {CURATED_BASKETS.map((basket) => (
            <li key={basket.id} className="py-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-semibold">{basket.name}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted">
                    {basket.ticker} · {basket.assets.length} names · 0% fee
                  </p>
                </div>
                <Link
                  href="/baskets"
                  className="shrink-0 text-sm font-semibold text-accent hover:text-ink"
                >
                  Buy
                </Link>
              </div>
              <p className="mt-2 text-sm text-muted">{basket.description}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          <Link href="/sip" className="font-semibold text-accent hover:text-ink">
            Start a SIP instead
          </Link>
        </p>
      </aside>
    </div>
  );
}
