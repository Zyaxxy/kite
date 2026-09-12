import { MarketInsight } from './types';

export const MOCK_MARKET_INSIGHTS: Record<string, MarketInsight> = {
  NVDA: {
    symbol: 'NVDA',
    price: 124.50,
    change24h: 3.82,
    sentimentScore: 0.85,
    sentimentLabel: 'Very Bullish',
    headlineNews: [
      'Blackwell chip demand outstripping supply through Q4',
      'Hyperscalers increase AI capex projections by 22%',
      'Wall Street reiterates Overweight on data center acceleration'
    ]
  },
  AAPL: {
    symbol: 'AAPL',
    price: 228.15,
    change24h: -0.45,
    sentimentScore: 0.20,
    sentimentLabel: 'Neutral',
    headlineNews: [
      'iPhone 16 AI features rolling out gradually across international markets',
      'App Store revenue shows resilient single-digit services growth',
      'Foxconn expands manufacturing capacity in India'
    ]
  },
  TSLA: {
    symbol: 'TSLA',
    price: 215.80,
    change24h: -2.10,
    sentimentScore: -0.35,
    sentimentLabel: 'Bearish',
    headlineNews: [
      'EV price cuts compress gross automotive margins in European segment',
      'Robotaxi event anticipation drives options volatility',
      'Supercharger network opening accelerates rival EV adoption'
    ]
  },
  MSFT: {
    symbol: 'MSFT',
    price: 432.90,
    change24h: 1.15,
    sentimentScore: 0.70,
    sentimentLabel: 'Bullish',
    headlineNews: [
      'Azure AI revenue contribution expands to record high',
      'Copilot enterprise seat adoption grows across Fortune 500',
      'OpenAI partnership governance structure formalized'
    ]
  }
};

export function getStockInsight(symbol: string): MarketInsight {
  return MOCK_MARKET_INSIGHTS[symbol.toUpperCase()] || {
    symbol: symbol.toUpperCase(),
    price: 100.0,
    change24h: 0.0,
    sentimentScore: 0.0,
    sentimentLabel: 'Neutral',
    headlineNews: ['Live onchain Pyth oracle price feed active']
  };
}
