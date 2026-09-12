export interface StockAsset {
  symbol: string;
  name: string;
  mint: string; // SPL Token Mint Address
  weight: number; // percentage in basis points (e.g. 2000 = 20%)
  pythFeedId: string;
  category: string;
}

export interface ThematicBasket {
  id: string;
  name: string;
  ticker: string;
  description: string;
  icon: string;
  assets: StockAsset[];
  rebalanceIntervalDays: number;
}

export interface SipSchedule {
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  amountUsdc: number;
  targetBasketOrStock: string;
  nextExecutionDate: string;
  active: boolean;
}

export interface MarketInsight {
  symbol: string;
  price: number;
  change24h: number;
  sentimentScore: number; // -1.0 to 1.0
  sentimentLabel: 'Very Bearish' | 'Bearish' | 'Neutral' | 'Bullish' | 'Very Bullish';
  headlineNews: string[];
}
