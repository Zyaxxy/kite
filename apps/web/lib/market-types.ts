export interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  volume: number;
  sparkline: number[];
  currency: string;
  category: string;
  lastUpdated: number;
  isPreStock?: boolean;
}
