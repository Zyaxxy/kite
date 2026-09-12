import type { MarketAsset } from './markets';

export interface MarketPulse {
  totalAssets: number;
  tradableAssets: number;
  pricedAssets: number;
  breadth: {
    advancing: number;
    declining: number;
    unchanged: number;
    coveredAssets: number;
    advancingPct: number | null;
  };
  volume24hUsd: number | null;
  volumeCoveredAssets: number;
  topVolume: MarketAsset[];
  gainers: MarketAsset[];
  losers: MarketAsset[];
}

/** Observed token-market breadth, not an equity index or a modeled sentiment score. */
export function getMarketPulse(assets: MarketAsset[], limit = 5): MarketPulse {
  const take = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5;
  const unique = [...new Map(assets.map(asset => [asset.mint, asset])).values()];
  const tradable = unique.filter(asset => !asset.tradingHalted);
  const priced = tradable.filter(asset => asset.priceUsd !== null && Number.isFinite(asset.priceUsd) && asset.priceUsd > 0);
  const changing = priced.filter(asset => asset.change24hPct !== null && Number.isFinite(asset.change24hPct));
  const withVolume = priced.filter(asset => asset.volume24hUsd !== null && Number.isFinite(asset.volume24hUsd) && asset.volume24hUsd >= 0);
  const advancing = changing.filter(asset => asset.change24hPct! > 0);
  const declining = changing.filter(asset => asset.change24hPct! < 0);
  const bySymbol = (a:MarketAsset,b:MarketAsset):number => a.symbol.localeCompare(b.symbol);
  return {
    totalAssets: unique.length,
    tradableAssets: tradable.length,
    pricedAssets: priced.length,
    breadth: {
      advancing: advancing.length,
      declining: declining.length,
      unchanged: changing.length - advancing.length - declining.length,
      coveredAssets: changing.length,
      advancingPct: changing.length ? advancing.length / changing.length * 100 : null,
    },
    volume24hUsd: withVolume.length ? withVolume.reduce((sum,asset) => sum + asset.volume24hUsd!,0) : null,
    volumeCoveredAssets: withVolume.length,
    topVolume: [...withVolume].sort((a,b) => b.volume24hUsd! - a.volume24hUsd! || bySymbol(a,b)).slice(0,take),
    gainers: [...advancing].sort((a,b) => b.change24hPct! - a.change24hPct! || bySymbol(a,b)).slice(0,take),
    losers: [...declining].sort((a,b) => a.change24hPct! - b.change24hPct! || bySymbol(a,b)).slice(0,take),
  };
}
