import { CURATED_BASKETS, MOCK_MARKET_INSIGHTS, DEVNET_MINTS, ThematicBasket } from '@kite/sdk';

export interface KiteStock {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  sentimentScore: number;
  sentimentLabel: 'Very Bearish' | 'Bearish' | 'Neutral' | 'Bullish' | 'Very Bullish';
  headlineNews: string[];
  sparkline: number[];
  exchange: string;
  mint: string;
  pythFeedId: string;
  category: string;
}

export interface KiteBasket extends ThematicBasket {
  return1Y: number;
  return3Y: number;
  price: number;
}

// Map traditional tickers to Solana tokenized stocks (xStocks & pre-stocks)
const STOCK_ENRICHMENTS: Record<string, { name: string; price: number; change24h: number; category: string }> = {
  xNVDA: { name: 'Nvidia Corp. xStock', price: 124.50, change24h: 3.82, category: 'AI & Compute' },
  xAAPL: { name: 'Apple Inc. xStock', price: 228.15, change24h: -0.45, category: 'Consumer Tech' },
  xMSFT: { name: 'Microsoft Corp. xStock', price: 432.90, change24h: 1.15, category: 'Cloud & Enterprise' },
  xTSLA: { name: 'Tesla Inc. xStock', price: 215.80, change24h: -2.10, category: 'Automotive & AI' },
  xAMZN: { name: 'Amazon.com Inc. xStock', price: 186.20, change24h: 0.85, category: 'E-Commerce & Cloud' },
  xGOOGL: { name: 'Alphabet Inc. xStock', price: 162.40, change24h: -0.30, category: 'Hyperscaler' },
  xMETA: { name: 'Meta Platforms Inc. xStock', price: 512.10, change24h: 2.10, category: 'Social & AI' },
  preOPENAI: { name: 'OpenAI Pre-Stock', price: 150.00, change24h: 0.00, category: 'Frontier AI' },
  preSPACEX: { name: 'SpaceX Pre-Stock', price: 210.00, change24h: 1.50, category: 'Aerospace' },
  preSTRIPE: { name: 'Stripe Pre-Stock', price: 95.00, change24h: 0.50, category: 'Fintech' },
};

export const KITE_STOCKS: KiteStock[] = Object.entries(DEVNET_MINTS)
  .filter(([sym]) => sym !== 'USDC')
  .map(([symbol, info]) => {
    const rawTicker = symbol.startsWith('x') ? symbol.slice(1) : symbol;
    const mockInsight = MOCK_MARKET_INSIGHTS[rawTicker] || MOCK_MARKET_INSIGHTS[symbol];
    const enrich = STOCK_ENRICHMENTS[symbol] || {
      name: info.name,
      price: 100.0,
      change24h: 0.0,
      category: 'Tokenized Equity',
    };

    return {
      symbol,
      name: enrich.name || info.name,
      price: mockInsight?.price || enrich.price,
      change24h: mockInsight?.change24h !== undefined ? mockInsight.change24h : enrich.change24h,
      sentimentScore: mockInsight?.sentimentScore ?? 0.35,
      sentimentLabel: mockInsight?.sentimentLabel ?? 'Bullish',
      headlineNews: mockInsight?.headlineNews || [
        `${symbol} tokenized 24/7 liquidity active on Solana SPL.`,
        'Sub-second settlement via Pyth Network oracle feeds.',
      ],
      sparkline: [118, 121, 119, 122, 125, 123, 127, 124, 128, 130],
      exchange: 'Solana SPL Token (24/7)',
      mint: info.mint,
      pythFeedId: '0xa412ea6eb7ecf265fb26079979cc3cf78183069c9b1f2ebff1562b8a7862c161',
      category: enrich.category,
    };
  });

export const KITE_STOCKS_MAP: Record<string, KiteStock> = Object.fromEntries(
  KITE_STOCKS.map((stock) => [stock.symbol, stock])
);

export const KITE_BASKETS: KiteBasket[] = CURATED_BASKETS.map((b) => ({
  ...b,
  return1Y: b.id === 'sol-mag7' ? 49.2 : b.id === 'sol-ai-infra' ? 62.1 : 28.4,
  return3Y: b.id === 'sol-mag7' ? 35.8 : b.id === 'sol-ai-infra' ? 24.6 : 16.9,
  price: b.id === 'sol-mag7' ? 248.5 : b.id === 'sol-ai-infra' ? 310.2 : 185.0,
}));

export interface ActiveSIP {
  id: string;
  name: string;
  targetTicker: string;
  amountUsdc: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  nextDate: string;
  status: 'active' | 'paused';
}

export const SIP_PRESETS: ActiveSIP[] = [
  {
    id: 'sip-1',
    name: 'MAG7 Tech Index Basket',
    targetTicker: 'SOL-MAG7',
    amountUsdc: 250,
    frequency: 'weekly',
    nextDate: '2026-09-18',
    status: 'active',
  },
  {
    id: 'sip-2',
    name: 'Nvidia Corp. xStock',
    targetTicker: 'xNVDA',
    amountUsdc: 100,
    frequency: 'monthly',
    nextDate: '2026-10-01',
    status: 'active',
  },
  {
    id: 'sip-3',
    name: 'AI & Semiconductor Leaders',
    targetTicker: 'AI-LEADERS',
    amountUsdc: 150,
    frequency: 'weekly',
    nextDate: '2026-09-20',
    status: 'paused',
  },
];

export interface PortfolioHolding {
  id: string;
  symbol: string;
  name: string;
  type: 'Stock' | 'Basket';
  shares: number;
  avgPrice: number;
  currentPrice: number;
  investedValue: number;
  currentValue: number;
}

export const PORTFOLIO_HOLDINGS: PortfolioHolding[] = [
  {
    id: 'hold-1',
    symbol: 'sol-mag7',
    name: 'Magnificent 7 Tech Basket',
    type: 'Basket',
    shares: 4.5,
    avgPrice: 235.0,
    currentPrice: 248.5,
    investedValue: 1057.5,
    currentValue: 1118.25,
  },
  {
    id: 'hold-2',
    symbol: 'xNVDA',
    name: 'Nvidia Corp. xStock',
    type: 'Stock',
    shares: 12.0,
    avgPrice: 118.2,
    currentPrice: 124.5,
    investedValue: 1418.4,
    currentValue: 1494.0,
  },
  {
    id: 'hold-3',
    symbol: 'xMSFT',
    name: 'Microsoft Corp. xStock',
    type: 'Stock',
    shares: 2.5,
    avgPrice: 420.0,
    currentPrice: 432.9,
    investedValue: 1050.0,
    currentValue: 1082.25,
  },
];
