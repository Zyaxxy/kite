'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { getStockInsight } from '@kite/sdk';
import { SentimentBadge } from '../../../components/SentimentBadge';
import Link from 'next/link';

export default function StockDetailPage() {
  const params = useParams();
  const symbol = ((params?.symbol as string) || 'nvda').toUpperCase();
  const insight = getStockInsight(symbol);
  const up = insight.change24h >= 0;

  return (
    <div className="max-w-3xl">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        Markets
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">{insight.symbol}</h1>
          <p className="mt-1 text-sm text-muted">Tokenized equity · SPL</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold tabular-nums">${insight.price.toFixed(2)}</p>
          <p className={`text-sm tabular-nums ${up ? 'text-up' : 'text-down'}`}>
            {up ? '+' : ''}
            {insight.change24h}% today
          </p>
        </div>
      </header>

      <div className="mt-8 flex items-baseline justify-between gap-4 border-y border-line py-4">
        <p className="text-sm text-muted">Sentiment from headlines, options flow, and Pyth vol.</p>
        <SentimentBadge score={insight.sentimentScore} label={insight.sentimentLabel} />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Catalysts</h2>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {insight.headlineNews.map((news) => (
            <li key={news} className="py-3 text-sm">
              {news}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-sm">
        <Link href="/sip" className="font-semibold text-accent hover:text-ink">
          SIP this name
        </Link>
        <span className="text-muted"> or </span>
        <Link href="/baskets" className="font-semibold text-accent hover:text-ink">
          buy a basket that holds it
        </Link>
      </p>
    </div>
  );
}
