import { NextRequest, NextResponse } from 'next/server';
import { QuoteData } from '../../../lib/market-types';

export type { QuoteData };

// In-memory cache for live quotes (15s TTL)
interface CacheEntry {
  data: QuoteData;
  expiresAt: number;
}

const quotesCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15000;

// Stock metadata registry
const STOCK_METADATA: Record<string, { name: string; category: string; yahooSymbol: string; fallbackPrice: number }> = {
  NVDA: { name: 'Nvidia Corp.', category: 'AI & Compute', yahooSymbol: 'NVDA', fallbackPrice: 218.29 },
  AAPL: { name: 'Apple Inc.', category: 'Consumer Tech', yahooSymbol: 'AAPL', fallbackPrice: 228.15 },
  MSFT: { name: 'Microsoft Corp.', category: 'Cloud & Enterprise', yahooSymbol: 'MSFT', fallbackPrice: 432.90 },
  TSLA: { name: 'Tesla Inc.', category: 'Automotive & AI', yahooSymbol: 'TSLA', fallbackPrice: 215.80 },
  AMZN: { name: 'Amazon.com Inc.', category: 'E-Commerce & Cloud', yahooSymbol: 'AMZN', fallbackPrice: 186.20 },
  GOOGL: { name: 'Alphabet Inc.', category: 'Hyperscaler', yahooSymbol: 'GOOGL', fallbackPrice: 162.40 },
  META: { name: 'Meta Platforms Inc.', category: 'Social & AI', yahooSymbol: 'META', fallbackPrice: 512.10 },
  SPY: { name: 'SPDR S&P 500 ETF Trust', category: 'Index ETF', yahooSymbol: 'SPY', fallbackPrice: 586.42 },
  QQQ: { name: 'Invesco QQQ Trust', category: 'Index ETF', yahooSymbol: 'QQQ', fallbackPrice: 489.10 },
  TSM: { name: 'Taiwan Semiconductor Mfg.', category: 'Pure-Play Foundry', yahooSymbol: 'TSM', fallbackPrice: 184.50 },
  ASML: { name: 'ASML Holding N.V.', category: 'Lithography Monopoly', yahooSymbol: 'ASML', fallbackPrice: 840.20 },
  AVGO: { name: 'Broadcom Inc.', category: 'Custom Silicon', yahooSymbol: 'AVGO', fallbackPrice: 172.80 },
  COIN: { name: 'Coinbase Global Inc.', category: 'Crypto Infrastructure', yahooSymbol: 'COIN', fallbackPrice: 245.60 },
  // Crypto benchmarks
  'SOL-USD': { name: 'Solana', category: 'L1 Blockchain', yahooSymbol: 'SOL-USD', fallbackPrice: 154.20 },
  'BTC-USD': { name: 'Bitcoin', category: 'Digital Gold', yahooSymbol: 'BTC-USD', fallbackPrice: 64280.00 },
};

// Pre-market secondary tech benchmarks
const PRE_STOCKS: Record<string, { name: string; category: string; price: number; changePct: number }> = {
  OPENAI: { name: 'OpenAI Pre-Stock', category: 'Frontier AI', price: 157.50, changePct: 2.45 },
  SPACEX: { name: 'SpaceX Pre-Stock', category: 'Aerospace', price: 212.00, changePct: 1.80 },
  STRIPE: { name: 'Stripe Pre-Stock', category: 'Global Fintech', price: 98.50, changePct: 0.90 },
  ANTHROPIC: { name: 'Anthropic Pre-Stock', category: 'Frontier AI', price: 84.00, changePct: 3.10 },
};

async function fetchLiveQuote(symbol: string): Promise<QuoteData> {
  const norm = symbol.trim().toUpperCase().replace(/^X/, '').replace(/^D/, '');
  const now = Date.now();

  const cached = quotesCache.get(norm);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  // Handle pre-market secondary stocks
  if (PRE_STOCKS[norm] || symbol.toUpperCase().startsWith('PRE')) {
    const preKey = norm.replace(/^PRE/, '');
    const pre = PRE_STOCKS[preKey] || { name: `${preKey} Pre-Stock`, category: 'Pre-IPO', price: 120.0, changePct: 1.2 };
    const change = (pre.price * pre.changePct) / 100;
    const base = pre.price - change;
    const step = change / 9;
    const sparkline = Array.from({ length: 10 }, (_, i) => Number((base + step * i).toFixed(2)));

    const quote: QuoteData = {
      symbol: `pre${preKey}`,
      name: pre.name,
      price: pre.price,
      change,
      changePct: pre.changePct,
      high: pre.price * 1.02,
      low: pre.price * 0.98,
      volume: 450000,
      sparkline,
      currency: 'USD',
      category: pre.category,
      lastUpdated: now,
      isPreStock: true,
    };

    quotesCache.set(norm, { data: quote, expiresAt: now + CACHE_TTL_MS });
    return quote;
  }

  const meta = STOCK_METADATA[norm] || {
    name: `${norm} Equity`,
    category: 'Tokenized Equity',
    yahooSymbol: norm,
    fallbackPrice: 100.0,
  };

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.yahooSymbol)}?interval=1d&range=1mo`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Kite-NeoBroker/1.0',
      },
      next: { revalidate: 15 },
    });

    if (!res.ok) {
      throw new Error(`Yahoo Finance status ${res.status}`);
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('No chart result');

    const m = result.meta;
    const currentPrice = Number(m.regularMarketPrice ?? meta.fallbackPrice);
    const prevClose = Number(m.chartPreviousClose ?? currentPrice);
    const change = currentPrice - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
    const high = Number(m.regularMarketDayHigh ?? currentPrice);
    const low = Number(m.regularMarketDayLow ?? currentPrice);
    const volume = Number(m.regularMarketVolume ?? 1000000);

    // Extract historical close candle points for sparkline
    const closePoints: number[] = result?.indicators?.quote?.[0]?.close ?? [];
    const validPoints = closePoints.filter((p: any) => typeof p === 'number' && !isNaN(p));
    const sparkline = validPoints.length >= 8
      ? validPoints.slice(-12).map((p: number) => Number(p.toFixed(2)))
      : [prevClose, currentPrice];

    const quote: QuoteData = {
      symbol: norm.includes('-') ? norm : `x${norm}`,
      name: meta.name,
      price: Number(currentPrice.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      volume,
      sparkline,
      currency: 'USD',
      category: meta.category,
      lastUpdated: now,
    };

    quotesCache.set(norm, { data: quote, expiresAt: now + CACHE_TTL_MS });
    return quote;
  } catch (err) {
    // Graceful fallback with deterministic live jitter
    const price = meta.fallbackPrice;
    const change = price * 0.012;
    const changePct = 1.2;
    const sparkline = [price * 0.98, price * 0.99, price * 0.985, price * 1.005, price * 1.01, price];

    const quote: QuoteData = {
      symbol: norm.includes('-') ? norm : `x${norm}`,
      name: meta.name,
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePct,
      high: price * 1.015,
      low: price * 0.98,
      volume: 850000,
      sparkline,
      currency: 'USD',
      category: meta.category,
      lastUpdated: now,
    };

    return quote;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols') || searchParams.get('symbol');

  // Default symbols to return if none specified
  const requested = symbolsParam
    ? symbolsParam.split(',').map((s) => s.trim().toUpperCase())
    : ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ', 'TSM', 'ASML', 'AVGO', 'OPENAI', 'SPACEX', 'STRIPE', 'SOL-USD', 'BTC-USD'];

  try {
    const quotes = await Promise.all(requested.map((sym) => fetchLiveQuote(sym)));
    const responseMap: Record<string, QuoteData> = {};

    quotes.forEach((q) => {
      // Map both clean and x-prefixed keys for easy lookup
      const raw = q.symbol.replace(/^x/, '').replace(/^pre/, '');
      responseMap[raw] = q;
      responseMap[q.symbol] = q;
    });

    return NextResponse.json({
      success: true,
      quotes: responseMap,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch real-time quotes' },
      { status: 500 }
    );
  }
}
