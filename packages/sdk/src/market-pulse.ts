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

export interface MarketPulseOptions {
  /**
   * Minimum pool liquidity in USD required for an asset to appear in mover rankings
   * (topVolume, gainers, losers). Defaults to 1000. Set to 0 to disable.
   */
  minLiquidityUsd?: number;
  /**
   * Maximum allowed price divergence percentage between the token price and
   * the underlying equity price (e.g. 15 for 15%).
   * Excludes severely depegged / distorted assets from mover rankings.
   * Defaults to 15. Set to 0 to disable.
   */
  maxDivergencePct?: number;
}

export const DEFAULT_MIN_MOVER_LIQUIDITY_USD = 1000;
export const DEFAULT_MAX_MOVER_DIVERGENCE_PCT = 15;

/** Observed token-market breadth, not an equity index or a modeled sentiment score. */
export function getMarketPulse(
  assets: MarketAsset[],
  limit = 5,
  options?: MarketPulseOptions,
): MarketPulse {
  const take = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5;
  const minLiquidityUsd = options?.minLiquidityUsd ?? DEFAULT_MIN_MOVER_LIQUIDITY_USD;
  const maxDivergencePct = options?.maxDivergencePct ?? DEFAULT_MAX_MOVER_DIVERGENCE_PCT;

  const unique = [...new Map(assets.map(asset => [asset.mint, asset])).values()];
  const tradable = unique.filter(asset => !asset.tradingHalted);
  const priced = tradable.filter(asset => asset.priceUsd !== null && Number.isFinite(asset.priceUsd) && asset.priceUsd > 0);
  const changing = priced.filter(asset => asset.change24hPct !== null && Number.isFinite(asset.change24hPct));
  const withVolume = priced.filter(asset => asset.volume24hUsd !== null && Number.isFinite(asset.volume24hUsd) && asset.volume24hUsd >= 0);
  const advancing = changing.filter(asset => asset.change24hPct! > 0);
  const declining = changing.filter(asset => asset.change24hPct! < 0);
  const bySymbol = (a:MarketAsset,b:MarketAsset):number => a.symbol.localeCompare(b.symbol);

  const isMoverEligible = (asset: MarketAsset): boolean => {
    // 1. Check pool liquidity threshold (if liquidity is tracked and below minimum)
    if (minLiquidityUsd > 0 && asset.liquidityUsd !== null && asset.liquidityUsd !== undefined) {
      if (asset.liquidityUsd < minLiquidityUsd) return false;
    }
    // 2. Check price divergence against underlying share (if both are present and valid)
    if (
      maxDivergencePct > 0 &&
      asset.priceUsd !== null &&
      asset.underlyingPriceUsd !== null &&
      asset.underlyingPriceUsd !== undefined &&
      Number.isFinite(asset.priceUsd) &&
      Number.isFinite(asset.underlyingPriceUsd) &&
      asset.underlyingPriceUsd > 0
    ) {
      const divergencePct = Math.abs(asset.priceUsd - asset.underlyingPriceUsd) / asset.underlyingPriceUsd * 100;
      if (divergencePct > maxDivergencePct) return false;
    }
    return true;
  };

  const eligibleVolume = withVolume.filter(isMoverEligible);
  const eligibleAdvancing = advancing.filter(isMoverEligible);
  const eligibleDeclining = declining.filter(isMoverEligible);

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
    topVolume: [...eligibleVolume].sort((a,b) => b.volume24hUsd! - a.volume24hUsd! || bySymbol(a,b)).slice(0,take),
    gainers: [...eligibleAdvancing].sort((a,b) => b.change24hPct! - a.change24hPct! || bySymbol(a,b)).slice(0,take),
    losers: [...eligibleDeclining].sort((a,b) => a.change24hPct! - b.change24hPct! || bySymbol(a,b)).slice(0,take),
  };
}

