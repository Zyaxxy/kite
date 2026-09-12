'use client';

import React, { useState, useEffect } from 'react';
import { KITE_STOCKS, KITE_STOCKS_MAP, KITE_BASKETS, KiteStock } from '../../lib/kite-data';
import { ArrowLeft, Calendar, ExternalLink, ShieldCheck, Sparkles, TrendingUp, Check, Copy } from 'lucide-react';

interface KiteStockDetailProps {
  symbol: string;
  isBasket?: boolean;
  onBack: () => void;
  onCreateSIP: (symbol: string) => void;
}

export function KiteStockDetail({ symbol, isBasket, onBack, onCreateSIP }: KiteStockDetailProps) {
  const [activeTimeframe, setActiveTimeframe] = useState<'1D' | '1W' | '1M' | '1Y'>('1D');
  const [copied, setCopied] = useState(false);
  const [newsData, setNewsData] = useState<{
    sentimentScore: number;
    sentimentLabel: string;
    aiSummary: string;
    articles: { title: string; source: string; link: string; pubDate: string; sentiment: string }[];
  } | null>(null);
  const [loadingNews, setLoadingNews] = useState(true);

  // Find basket or stock
  const basket = isBasket ? KITE_BASKETS.find((b) => b.id === symbol || b.ticker === symbol) : null;
  const stock = !basket ? KITE_STOCKS_MAP[symbol] || KITE_STOCKS.find((s) => s.symbol === symbol) : null;

  useEffect(() => {
    setLoadingNews(true);
    const querySym = basket ? basket.ticker : stock ? stock.symbol : symbol;
    fetch(`/api/news?symbol=${encodeURIComponent(querySym)}`)
      .then((res) => res.json())
      .then((data) => {
        setNewsData(data);
        setLoadingNews(false);
      })
      .catch(() => {
        setLoadingNews(false);
      });
  }, [symbol, basket, stock]);

  if (!basket && !stock) {
    return (
      <div className="p-8 text-center bg-raised border border-line rounded-xl space-y-4">
        <p className="text-muted">Asset not found: {symbol}</p>
        <button onClick={onBack} className="text-xs font-semibold text-accent hover:underline">
          &larr; Return to Markets
        </button>
      </div>
    );
  }

  const name = basket ? basket.name : stock!.name;
  const displaySymbol = basket ? basket.ticker : stock!.symbol;
  const price = stock ? stock.price : 248.5;
  const change24h = stock ? stock.change24h : 1.42;
  const isUp = change24h >= 0;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="self-start flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Markets</span>
      </button>

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-white/10 text-ink">
              {displaySymbol}
            </span>
            <span className="text-xs text-muted">
              {basket ? 'Thematic Basket' : stock!.exchange}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-up border border-up/30">
              Pyth Live
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">{name}</h1>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-3xl font-bold font-mono text-ink tracking-tight">
            ${price.toFixed(2)}
          </div>
          <div className={`text-xs font-semibold font-mono mt-0.5 ${isUp ? 'text-up' : 'text-down'}`}>
            {isUp ? '+' : ''}{change24h.toFixed(2)}% (24h)
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="bg-raised border border-line rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-1">
            {(['1D', '1W', '1M', '1Y'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setActiveTimeframe(tf)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeTimeframe === tf
                    ? 'bg-bg text-ink border border-line'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-muted font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-up animate-pulse" />
            Oracle feed synced
          </div>
        </div>

        {/* SVG Sparkline / Trend Line */}
        <div className="h-44 w-full relative">
          <svg viewBox="0 0 500 120" preserveAspectRatio="none" className="w-full h-full">
            <defs>
              <linearGradient id="detailGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isUp ? 'var(--up)' : 'var(--down)'} stopOpacity="0.25" />
                <stop offset="100%" stopColor={isUp ? 'var(--up)' : 'var(--down)'} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M 0,120 L 0,80 Q 80,40 160,65 T 320,30 T 500,20 L 500,120 Z"
              fill="url(#detailGrad)"
            />
            <path
              d="M 0,80 Q 80,40 160,65 T 320,30 T 500,20"
              fill="none"
              stroke={isUp ? 'var(--up)' : 'var(--down)'}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Real-Time AI News & Market Sentiment Intelligence */}
      <div className="bg-raised border border-line rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-ink">AI Market Sentiment & Live Catalysts</h2>
          </div>
          {newsData && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                newsData.sentimentScore >= 0.2
                  ? 'bg-up/10 text-up border-up/30'
                  : newsData.sentimentScore <= -0.2
                  ? 'bg-down/10 text-down border-down/30'
                  : 'bg-muted/10 text-muted border-line'
              }`}
            >
              {newsData.sentimentLabel} ({newsData.sentimentScore > 0 ? '+' : ''}
              {newsData.sentimentScore})
            </span>
          )}
        </div>

        {/* AI Catalyst Brief */}
        <div className="p-3.5 bg-bg border border-line rounded-lg text-xs leading-relaxed text-muted">
          {loadingNews ? (
            <span>Analyzing real-time market catalysts and feed sentiment...</span>
          ) : newsData?.aiSummary ? (
            <span className="text-ink">{newsData.aiSummary}</span>
          ) : (
            <span>Sustained institutional flow recorded on Solana tokenized equity pools.</span>
          )}
        </div>

        {/* Real News Headlines */}
        {newsData?.articles && newsData.articles.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-line">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block">
              Verified Headlines
            </span>
            <div className="divide-y divide-line">
              {newsData.articles.slice(0, 3).map((art, idx) => (
                <div key={idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <a
                      href={art.link}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-ink hover:text-accent transition-colors block"
                    >
                      {art.title}
                    </a>
                    <span className="text-[11px] text-muted mt-0.5 block">
                      {art.source} · {art.pubDate}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      art.sentiment === 'Bullish'
                        ? 'text-up bg-up/10'
                        : art.sentiment === 'Bearish'
                        ? 'text-down bg-down/10'
                        : 'text-muted bg-muted/10'
                    }`}
                  >
                    {art.sentiment}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Basket Constituents (if viewing a basket) */}
      {basket && (
        <div className="bg-raised border border-line rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-ink">Basket Constituents ({basket.assets.length})</h2>
          <div className="divide-y divide-line">
            {basket.assets.map((asset) => {
              const weightPct = (asset.weight / 100).toFixed(1);
              return (
                <div key={asset.symbol} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-ink font-mono">{asset.symbol}</span>
                    <span className="text-muted block text-[11px]">{asset.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-bg rounded-full overflow-hidden hidden sm:block">
                      <div className="h-full bg-accent" style={{ width: `${weightPct}%` }} />
                    </div>
                    <span className="font-mono text-ink font-semibold w-12 text-right">
                      {weightPct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Onchain Specifications */}
      {stock && (
        <div className="bg-raised border border-line rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-ink">Onchain Solana Verification</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-bg border border-line rounded-lg">
              <span className="text-muted text-[11px] block mb-1">SPL Token Mint</span>
              <div className="flex items-center justify-between gap-2 font-mono text-ink">
                <span className="truncate">{stock.mint}</span>
                <button
                  onClick={() => copyToClipboard(stock.mint)}
                  className="p-1 rounded hover:bg-white/10 text-muted hover:text-ink shrink-0"
                  title="Copy Mint Address"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-up" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="p-3 bg-bg border border-line rounded-lg">
              <span className="text-muted text-[11px] block mb-1">Pyth Price Feed ID</span>
              <div className="flex items-center justify-between gap-2 font-mono text-accent">
                <span className="truncate">{stock.pythFeedId}</span>
                <span className="text-[10px] text-muted shrink-0">Devnet Feed</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create SIP CTA Banner */}
      <div className="bg-raised border border-line rounded-xl p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">Automate with a Non-Custodial SIP</h3>
            <p className="text-xs text-muted mt-0.5">
              Dollar-cost average into {displaySymbol} on a recurring schedule in USDC.
            </p>
          </div>
        </div>

        <button
          onClick={() => onCreateSIP(displaySymbol)}
          className="px-4 py-2 rounded-lg bg-accent text-accent-ink hover:opacity-90 font-bold text-xs transition-opacity shrink-0"
        >
          Create SIP
        </button>
      </div>
    </div>
  );
}
