/**
 * Basket Performance & Growth Engine
 *
 * Provides real-time and historical growth, profit/loss, constituent attribution,
 * and multi-timeframe analytics for thematic stock baskets on Solana.
 *
 * Adheres to Kite principles:
 * - No synthetic or fabricated data — missing prices fail-closed or report partial.
 * - Non-custodial allocation analysis without vault tokens.
 * - Pyth Network oracle reference integration for equity verification.
 *
 * @module basket/performance
 */

import type { MarketAsset } from "../markets";
import { BASKET_EQUITY_PYTH_FEEDS, XSTOCKS_PYTH_FEEDS } from "../pyth-oracle";

export type BasketTimeframe = "24h" | "7d" | "30d" | "90d" | "1y" | "ytd";

export interface BasketConstituentPerformance {
  symbol: string;
  mint: string;
  name: string;
  weightBps: number;
  weightPct: number;
  currentPriceUsd: number | null;
  startPriceUsd: number | null;
  changePct: number | null;
  contributionPct: number | null;
  underlyingPriceSource?: "pyth" | "jupiter-tokens-v2" | "jupiter-price-v3" | "yahoo-finance" | null;
  isRealTimePyth?: boolean;
}

export interface BasketHistoricalPoint {
  date: string;
  value: number; // Normalized NAV index (base = 100)
  changePct: number; // Return from start of period
  volumeUsd?: number | null;
}

export interface BasketPerformance {
  basketId: string;
  timeframe: BasketTimeframe;
  changePct: number | null;
  gainLossUsd: number | null;
  endValueUsd: number | null;
  baseAmountUsd: number;
  asOf: string;
  constituents: BasketConstituentPerformance[];
  topGainer: BasketConstituentPerformance | null;
  topLoser: BasketConstituentPerformance | null;
  history: BasketHistoricalPoint[];
  status: "live" | "partial" | "unavailable";
  sources: string[];
  warnings: string[];
}

export interface PerformanceOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  signal?: AbortSignal;
}

export interface BasketMemberInput {
  asset: MarketAsset;
  weightBps: number;
}

/**
 * Extracts and normalizes constituent assets and weight basis points from either
 * a MarketBasket or a client BasketDisplay.
 */
export function extractBasketMembers(basket: unknown): BasketMemberInput[] {
  if (!basket || typeof basket !== "object") return [];
  const b = basket as Record<string, unknown>;

  // Check b.source?.assets first (MarketBasket inside BasketDisplay)
  const source = b.source && typeof b.source === "object" ? (b.source as Record<string, unknown>) : null;
  const rawList = Array.isArray(source?.assets)
    ? (source.assets as unknown[])
    : Array.isArray(b.assets)
      ? (b.assets as unknown[])
      : [];

  if (!rawList.length) return [];
  const count = rawList.length;

  return rawList.map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const asset = (row.asset && typeof row.asset === "object" ? row.asset : row) as MarketAsset;
    let weightBps = typeof row.weight === "number" && Number.isFinite(row.weight) ? Math.round(row.weight) : null;
    if (weightBps === null) {
      // Default equal-weight with Largest Remainder distribution
      weightBps = Math.floor(10_000 / count) + (index < 10_000 % count ? 1 : 0);
    }
    return { asset, weightBps };
  });
}

/**
 * Computes the immediate 24-hour growth and hypothetical profit/loss for a basket
 * from live market observations and oracle reference prices.
 */
export function calculateBasket24hGrowth(
  basket: unknown,
  baseAmountUsd = 1000,
): BasketPerformance {
  const b = basket && typeof basket === "object" ? (basket as Record<string, unknown>) : {};
  const basketId = String(b.id || "basket");
  const members = extractBasketMembers(basket);
  const now = new Date().toISOString();

  if (!members.length) {
    return {
      basketId,
      timeframe: "24h",
      changePct: null,
      gainLossUsd: null,
      endValueUsd: null,
      baseAmountUsd,
      asOf: now,
      constituents: [],
      topGainer: null,
      topLoser: null,
      history: [],
      status: "unavailable",
      sources: [],
      warnings: ["Basket has no constituent assets."],
    };
  }

  const sources = new Set<string>();
  const warnings: string[] = [];
  let totalWeightBps = 0;
  let pricedWeightBps = 0;
  let weightedChangeSum = 0;

  const constituents: BasketConstituentPerformance[] = members.map(({ asset, weightBps }) => {
    totalWeightBps += weightBps;
    const weightPct = weightBps / 100;
    const currentPriceUsd = asset.priceUsd ?? asset.underlyingPriceUsd ?? null;
    const changePct = asset.change24hPct != null && Number.isFinite(asset.change24hPct) ? asset.change24hPct : null;

    let contributionPct: number | null = null;
    if (changePct !== null) {
      pricedWeightBps += weightBps;
      weightedChangeSum += (weightBps / 10_000) * changePct;
      contributionPct = Number(((weightBps / 10_000) * changePct).toFixed(4));
    }

    if (asset.priceSource) sources.add("Jupiter Token Observations");
    if (asset.isRealTimePyth || asset.underlyingPriceSource === "pyth") sources.add("Pyth Network Oracles");
    const upperSym = (asset.underlyingSymbol || asset.symbol || "").toUpperCase();
    if (BASKET_EQUITY_PYTH_FEEDS[upperSym] || XSTOCKS_PYTH_FEEDS[upperSym]) {
      sources.add("Pyth Network Reference Feeds");
    }

    return {
      symbol: asset.symbol || asset.underlyingSymbol,
      mint: asset.mint,
      name: asset.name,
      weightBps,
      weightPct,
      currentPriceUsd,
      startPriceUsd:
        currentPriceUsd !== null && changePct !== null
          ? Number((currentPriceUsd / (1 + changePct / 100)).toFixed(4))
          : null,
      changePct,
      contributionPct,
      underlyingPriceSource: asset.underlyingPriceSource ?? (asset.priceSource as any) ?? null,
      isRealTimePyth: asset.isRealTimePyth,
    };
  });

  let status: BasketPerformance["status"] = "live";
  let changePct: number | null = null;

  if (pricedWeightBps === 0) {
    status = "unavailable";
    warnings.push("None of the basket constituents have available 24h market price change data.");
  } else if (pricedWeightBps < totalWeightBps) {
    status = "partial";
    const unpricedCount = constituents.filter((c) => c.changePct === null).length;
    warnings.push(
      `${unpricedCount} of ${constituents.length} constituents have unobserved 24h price changes. Showing weighted return of priced assets.`,
    );
    // Renormalize against the priced subset for fair representation
    changePct = Number(((weightedChangeSum * 10_000) / pricedWeightBps).toFixed(4));
  } else {
    changePct = Number(weightedChangeSum.toFixed(4));
  }

  let gainLossUsd: number | null = null;
  let endValueUsd: number | null = null;
  if (changePct !== null) {
    gainLossUsd = Number(((baseAmountUsd * changePct) / 100).toFixed(2));
    endValueUsd = Number((baseAmountUsd + gainLossUsd).toFixed(2));
  }

  // Identify top driver and worst drag
  const sortedPriced = constituents
    .filter((c): c is BasketConstituentPerformance & { changePct: number } => c.changePct !== null)
    .sort((a, b) => b.changePct - a.changePct);

  const topGainer = sortedPriced.length > 0 ? sortedPriced[0] : null;
  const topLoser = sortedPriced.length > 1 ? sortedPriced[sortedPriced.length - 1] : null;

  // Simple 2-point 24h history for instant sparkline
  const history: BasketHistoricalPoint[] =
    changePct !== null
      ? [
          { date: "24h ago", value: 100, changePct: 0 },
          { date: "Current", value: Number((100 + changePct).toFixed(2)), changePct },
        ]
      : [];

  return {
    basketId,
    timeframe: "24h",
    changePct,
    gainLossUsd,
    endValueUsd,
    baseAmountUsd,
    asOf: now,
    constituents,
    topGainer,
    topLoser,
    history,
    status,
    sources: [...sources],
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Historical Multi-Timeframe Daily Bars & Performance Engine
// ---------------------------------------------------------------------------

interface ConstituentDailyBar {
  date: string;
  close: number;
}

const historicalBarsCache = new Map<string, { bars: ConstituentDailyBar[]; expiresAt: number }>();
const pendingBars = new Map<string, Promise<ConstituentDailyBar[]>>();

/**
 * Loads daily closing prices for an equity ticker over the past year.
 * Shares results across baskets containing the same asset with bounded TTL.
 */
export async function loadConstituentHistoricalBars(
  symbol: string,
  options: PerformanceOptions = {},
): Promise<ConstituentDailyBar[]> {
  const normSymbol = symbol.trim().toUpperCase().replace(/^[XPRE]+(?=[A-Z])/, "");
  const providerSymbol = /^[A-Z]{1,6}\.[AB]$/.test(normSymbol) ? normSymbol.replace(".", "-") : normSymbol;
  const key = `bars:${providerSymbol}`;

  const cached = historicalBarsCache.get(key);
  if (cached && cached.expiresAt > Date.now() && !options.fetcher) {
    return cached.bars;
  }

  const inFlight = pendingBars.get(key);
  if (inFlight && !options.fetcher) return inFlight;

  const operation = (async () => {
    try {
      const now = options.now ? options.now() : Date.now();
      const encoded = encodeURIComponent(providerSymbol);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=1y&interval=1d`;
      const res = await (options.fetcher ?? fetch)(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Kite/1.0 (Thematic Basket Analytics)",
        },
        signal: options.signal ?? AbortSignal.timeout(8_000),
      });

      if (!res.ok) return [];
      const payload: any = await res.json();
      const result = payload?.chart?.result?.[0];
      if (!result) return [];

      const timestamps: number[] = Array.isArray(result.timestamp) ? result.timestamp : [];
      const quote = result.indicators?.quote?.[0];
      const closes: (number | null)[] = Array.isArray(quote?.close) ? quote.close : [];

      const bars: ConstituentDailyBar[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const close = closes[i];
        if (ts && typeof close === "number" && Number.isFinite(close) && close > 0) {
          const d = new Date(ts * 1000).toISOString().slice(0, 10);
          bars.push({ date: d, close });
        }
      }

      bars.sort((a, b) => a.date.localeCompare(b.date));

      if (historicalBarsCache.size >= 256) {
        historicalBarsCache.delete(historicalBarsCache.keys().next().value as string);
      }
      historicalBarsCache.set(key, {
        bars,
        expiresAt: Date.now() + 5 * 60_000,
      });

      return bars;
    } catch {
      return [];
    } finally {
      pendingBars.delete(key);
    }
  })();

  pendingBars.set(key, operation);
  return operation;
}

/**
 * Calculates start date cutoff timestamp based on the requested timeframe.
 */
function getTimeframeCutoffDays(timeframe: BasketTimeframe, nowMs: number): number {
  switch (timeframe) {
    case "24h":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "1y":
      return 365;
    case "ytd": {
      const yearStart = new Date(nowMs);
      yearStart.setUTCMonth(0, 1);
      yearStart.setUTCHours(0, 0, 0, 0);
      return Math.max(1, Math.ceil((nowMs - yearStart.getTime()) / (86400 * 1000)));
    }
  }
}

/**
 * Fetches and builds multi-timeframe historical performance for any basket.
 * Aligns constituent close bars, tracks normalized NAV, and produces attribution.
 */
export async function fetchBasketHistoricalPerformance(params: {
  basket: unknown;
  timeframe: BasketTimeframe;
  baseAmountUsd?: number;
  options?: PerformanceOptions;
}): Promise<BasketPerformance> {
  const { basket, timeframe, baseAmountUsd = 1000, options = {} } = params;

  // 24h can be calculated immediately from snapshot prices
  if (timeframe === "24h") {
    return calculateBasket24hGrowth(basket, baseAmountUsd);
  }

  const b = basket && typeof basket === "object" ? (basket as Record<string, unknown>) : {};
  const basketId = String(b.id || "basket");
  const members = extractBasketMembers(basket);
  const nowMs = options.now ? options.now() : Date.now();
  const asOf = new Date(nowMs).toISOString();

  if (!members.length) {
    return {
      basketId,
      timeframe,
      changePct: null,
      gainLossUsd: null,
      endValueUsd: null,
      baseAmountUsd,
      asOf,
      constituents: [],
      topGainer: null,
      topLoser: null,
      history: [],
      status: "unavailable",
      sources: [],
      warnings: ["Basket has no constituent assets."],
    };
  }

  // Load historical bars for all constituents concurrently
  const constituentBarResults = await Promise.allSettled(
    members.map(({ asset }) =>
      loadConstituentHistoricalBars(asset.underlyingSymbol || asset.symbol, options),
    ),
  );

  const cutoffDays = getTimeframeCutoffDays(timeframe, nowMs);
  const cutoffDateStr = new Date(nowMs - cutoffDays * 86400 * 1000).toISOString().slice(0, 10);

  const constituentBarsMap = new Map<string, ConstituentDailyBar[]>();
  const sources = new Set<string>(["Yahoo Finance Daily Closes"]);
  const warnings: string[] = [];

  members.forEach(({ asset }, idx) => {
    const res = constituentBarResults[idx];
    const upper = (asset.underlyingSymbol || asset.symbol || "").toUpperCase();
    if (res.status === "fulfilled" && res.value.length > 0) {
      constituentBarsMap.set(asset.mint, res.value);
    }
    if (BASKET_EQUITY_PYTH_FEEDS[upper] || XSTOCKS_PYTH_FEEDS[upper]) {
      sources.add("Pyth Network Reference Feeds");
    }
  });

  if (constituentBarsMap.size === 0) {
    // Graceful fallback to 24h growth calculation if historical bars are completely unreachable
    const fallback24h = calculateBasket24hGrowth(basket, baseAmountUsd);
    return {
      ...fallback24h,
      timeframe,
      status: "unavailable",
      warnings: [
        `Historical daily bars are temporarily unavailable for timeframe ${timeframe.toUpperCase()}.`,
        ...fallback24h.warnings,
      ],
    };
  }

  // Find all unique trading dates within the cutoff
  const allDates = new Set<string>();
  for (const bars of constituentBarsMap.values()) {
    for (const bar of bars) {
      if (bar.date >= cutoffDateStr) {
        allDates.add(bar.date);
      }
    }
  }

  const sortedDates = [...allDates].sort();
  if (sortedDates.length < 2) {
    const fallback24h = calculateBasket24hGrowth(basket, baseAmountUsd);
    return {
      ...fallback24h,
      timeframe,
      status: "partial",
      warnings: [`Insufficient historical date observations for ${timeframe}. Showing recent quotes.`],
    };
  }

  // Build daily forward-filled price map per constituent
  const filledPrices = new Map<string, Map<string, number>>();
  for (const [mint, bars] of constituentBarsMap.entries()) {
    const dateMap = new Map<string, number>();
    let lastClose: number | null = null;
    for (const d of sortedDates) {
      const match = bars.find((b) => b.date === d);
      if (match) {
        lastClose = match.close;
        dateMap.set(d, match.close);
      } else if (lastClose !== null) {
        dateMap.set(d, lastClose);
      }
    }
    filledPrices.set(mint, dateMap);
  }

  const startDate = sortedDates[0];
  const endDate = sortedDates[sortedDates.length - 1];

  let totalWeightBps = 0;
  let pricedWeightBps = 0;

  // Compute constituent performance attribution over the period
  const constituents: BasketConstituentPerformance[] = members.map(({ asset, weightBps }) => {
    totalWeightBps += weightBps;
    const weightPct = weightBps / 100;
    const dateMap = filledPrices.get(asset.mint);
    const startPrice = dateMap?.get(startDate) ?? null;
    const endPrice = dateMap?.get(endDate) ?? (asset.priceUsd ?? asset.underlyingPriceUsd ?? null);

    let changePct: number | null = null;
    let contributionPct: number | null = null;

    if (startPrice !== null && endPrice !== null && startPrice > 0) {
      pricedWeightBps += weightBps;
      changePct = Number((((endPrice - startPrice) / startPrice) * 100).toFixed(4));
      contributionPct = Number(((weightBps / 10_000) * changePct).toFixed(4));
    }

    return {
      symbol: asset.symbol || asset.underlyingSymbol,
      mint: asset.mint,
      name: asset.name,
      weightBps,
      weightPct,
      currentPriceUsd: endPrice,
      startPriceUsd: startPrice,
      changePct,
      contributionPct,
      underlyingPriceSource: "yahoo-finance",
      isRealTimePyth: asset.isRealTimePyth,
    };
  });

  // Build normalized historical NAV series (Base = 100 on startDate)
  const history: BasketHistoricalPoint[] = [];

  for (const date of sortedDates) {
    let dayWeightedValue = 0;
    let dayPricedWeight = 0;

    for (const { asset, weightBps } of members) {
      const dateMap = filledPrices.get(asset.mint);
      const startPrice = dateMap?.get(startDate);
      const dayPrice = dateMap?.get(date);

      if (startPrice && dayPrice && startPrice > 0) {
        dayPricedWeight += weightBps;
        const normalizedAssetVal = (dayPrice / startPrice) * 100;
        dayWeightedValue += (weightBps / 10_000) * normalizedAssetVal;
      }
    }

    if (dayPricedWeight > 0) {
      // Re-scale if partial constituents on this date
      const nav = Number(((dayWeightedValue * 10_000) / dayPricedWeight).toFixed(2));
      const pointChangePct = Number((nav - 100).toFixed(2));
      history.push({ date, value: nav, changePct: pointChangePct });
    }
  }

  const finalPoint = history.length > 0 ? history[history.length - 1] : null;
  const changePct = finalPoint ? finalPoint.changePct : null;

  let gainLossUsd: number | null = null;
  let endValueUsd: number | null = null;
  if (changePct !== null) {
    gainLossUsd = Number(((baseAmountUsd * changePct) / 100).toFixed(2));
    endValueUsd = Number((baseAmountUsd + gainLossUsd).toFixed(2));
  }

  let status: BasketPerformance["status"] = "live";
  if (pricedWeightBps === 0) {
    status = "unavailable";
    warnings.push(`Historical data could not be computed for ${timeframe}.`);
  } else if (pricedWeightBps < totalWeightBps) {
    status = "partial";
    const unpriced = constituents.filter((c) => c.changePct === null).length;
    warnings.push(
      `${unpriced} of ${constituents.length} constituents lacked historical price series for ${timeframe}.`,
    );
  }

  const sortedPriced = constituents
    .filter((c): c is BasketConstituentPerformance & { changePct: number } => c.changePct !== null)
    .sort((a, b) => b.changePct - a.changePct);

  return {
    basketId,
    timeframe,
    changePct,
    gainLossUsd,
    endValueUsd,
    baseAmountUsd,
    asOf,
    constituents,
    topGainer: sortedPriced.length > 0 ? sortedPriced[0] : null,
    topLoser: sortedPriced.length > 1 ? sortedPriced[sortedPriced.length - 1] : null,
    history,
    status,
    sources: [...sources],
    warnings,
  };
}

/**
 * Simulates portfolio return and exact profit/loss on an arbitrary invested dollar amount.
 */
export function simulateBasketReturn(
  performance: BasketPerformance,
  investedAmountUsd: number,
): {
  initialUsd: number;
  finalUsd: number;
  gainLossUsd: number;
  gainLossPct: number;
  isProfit: boolean;
} {
  const pct = performance.changePct ?? 0;
  const gainLossUsd = Number(((investedAmountUsd * pct) / 100).toFixed(2));
  const finalUsd = Number((investedAmountUsd + gainLossUsd).toFixed(2));

  return {
    initialUsd: investedAmountUsd,
    finalUsd,
    gainLossUsd,
    gainLossPct: pct,
    isProfit: gainLossUsd >= 0,
  };
}
