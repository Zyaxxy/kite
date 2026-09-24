import { NextRequest, NextResponse } from "next/server";
import {
  fetchBasketHistoricalPerformance,
  calculateBasket24hGrowth,
  resolveCanonicalBasket,
  type BasketTimeframe,
  type BasketPerformance,
} from "@kite/sdk";
import { getServerMarketCatalog } from "@/lib/server/markets";
import {
  getRedisBasketPerformance,
  setRedisBasketPerformance,
} from "@/lib/server/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TIMEFRAMES = new Set<BasketTimeframe>([
  "24h",
  "7d",
  "30d",
  "90d",
  "1y",
  "ytd",
]);

// In-memory bounded performance cache
const memoryCache = new Map<string, { data: BasketPerformance; expiresAt: number }>();
const pendingCalculations = new Map<string, Promise<BasketPerformance>>();

function getMemoryCached(key: string): BasketPerformance | null {
  const item = memoryCache.get(key);
  if (item && item.expiresAt > Date.now()) {
    return item.data;
  }
  if (item && item.expiresAt <= Date.now()) {
    memoryCache.delete(key);
  }
  return null;
}

function setMemoryCached(key: string, data: BasketPerformance, ttlMs: number) {
  if (memoryCache.size >= 256) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export async function GET(request: Request | NextRequest) {
  const url = new URL(request.url);
  const basketId = url.searchParams.get("id")?.trim() ?? "";
  const rawTimeframe = (url.searchParams.get("timeframe")?.trim() ?? "30d") as BasketTimeframe;
  const rawAmount = Number(url.searchParams.get("amount") ?? "1000");
  const rawAllocations = url.searchParams.get("allocations")?.trim() ?? "";

  if (!basketId || basketId.length > 64) {
    return NextResponse.json(
      { error: "Provide a valid basket identifier." },
      { status: 400 },
    );
  }

  const timeframe: BasketTimeframe = VALID_TIMEFRAMES.has(rawTimeframe)
    ? rawTimeframe
    : "30d";

  const amount = Number.isFinite(rawAmount) && rawAmount > 0 && rawAmount <= 1_000_000
    ? rawAmount
    : 1000;

  const cacheKey = `${basketId}:${timeframe}:${amount}:${rawAllocations}`;

  // 1. Check in-memory cache
  const memCached = getMemoryCached(cacheKey);
  if (memCached) {
    return NextResponse.json(memCached, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=120, stale-while-revalidate=600",
        "X-Cache": "HIT-MEMORY",
      },
    });
  }

  // 2. Check distributed Redis cache if configured
  try {
    const redisCached = await getRedisBasketPerformance(cacheKey);
    if (redisCached) {
      setMemoryCached(cacheKey, redisCached, timeframe === "24h" ? 60_000 : 300_000);
      return NextResponse.json(redisCached, {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=120, stale-while-revalidate=600",
          "X-Cache": "HIT-REDIS",
        },
      });
    }
  } catch {
    // Non-blocking fallback
  }

  // 3. Deduplicate in-flight calculations
  const inFlight = pendingCalculations.get(cacheKey);
  if (inFlight) {
    try {
      const data = await inFlight;
      return NextResponse.json(data, {
        status: 200,
        headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=600" },
      });
    } catch {
      // Proceed with new attempt
    }
  }

  const calculatePromise = (async (): Promise<BasketPerformance> => {
    // 1. Resolve canonical baskets in 0ms without any network calls
    let basket = resolveCanonicalBasket(basketId);

    // 2. Support user-created custom baskets passed via allocations in 0ms
    if (!basket && rawAllocations) {
      const parts = rawAllocations.split(",").map((p) => p.trim()).filter(Boolean);
      const members = parts
        .map((part) => {
          const [sym, weightStr] = part.split(":");
          const symbol = (sym || "").trim().toUpperCase();
          if (!symbol) return null;
          return {
            asset: {
              mint: `custom-${symbol.toLowerCase()}`,
              symbol,
              underlyingSymbol: symbol,
              name: symbol,
              issuer: "xstocks" as const,
              kind: "equity" as const,
              verified: true,
              tradingHalted: false,
              priceUsd: null,
              change24hPct: null,
              decimals: 8,
              logoUrl: null,
              volume24hUsd: null,
              liquidityUsd: null,
              marketCapUsd: null,
              updatedAt: null,
              priceObservedAt: null,
              sourceUrl: "https://api.xstocks.fi/api/v2/public/assets",
            },
            weight: Number(weightStr) || 2500,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      if (members.length > 0) {
        basket = {
          id: basketId,
          name: url.searchParams.get("name")?.trim() || "Custom Basket",
          ticker: "CUSTOM",
          description: "User created custom basket",
          assets: members,
          available: true,
          missingSymbols: [],
          isCustom: true,
        };
      }
    }

    // 3. Fallback: check dynamic catalog only if not canonical and no allocations provided
    if (!basket) {
      try {
        const markets = await getServerMarketCatalog();
        basket = markets.baskets.find((b) => b.id.toLowerCase() === basketId.toLowerCase()) ?? null;
      } catch {
        // Non-blocking fallback
      }
    }

    if (!basket) {
      throw new Error("NOT_FOUND");
    }

    const timeoutSignal = AbortSignal.timeout(8_000);
    const effectiveSignal = request.signal
      ? AbortSignal.any([request.signal, timeoutSignal])
      : timeoutSignal;

    let performance: BasketPerformance;
    if (timeframe === "24h") {
      performance = calculateBasket24hGrowth(basket, amount);
    } else {
      performance = await fetchBasketHistoricalPerformance({
        basket,
        timeframe,
        baseAmountUsd: amount,
        options: { signal: effectiveSignal },
      });
    }

    // Cache the verified calculation: 1 hour (3600s) for historical timeframes, 1 min for 24h
    const ttlSeconds = timeframe === "24h" ? 60 : 3600;
    setMemoryCached(cacheKey, performance, ttlSeconds * 1000);
    void setRedisBasketPerformance(cacheKey, performance, ttlSeconds);

    return performance;
  })();

  pendingCalculations.set(cacheKey, calculatePromise);

  try {
    const performance = await calculatePromise;
    return NextResponse.json(performance, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=120, stale-while-revalidate=600",
        "X-Cache": "MISS",
      },
    });
  } catch (err: any) {
    if (err.message === "NOT_FOUND") {
      return NextResponse.json(
        { error: "This basket was not found in the verified catalog." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Basket performance data is temporarily unavailable. Please retry." },
      { status: 503 },
    );
  } finally {
    pendingCalculations.delete(cacheKey);
  }
}
