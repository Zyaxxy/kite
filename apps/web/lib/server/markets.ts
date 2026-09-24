import {
  getMainnetCatalog,
  getMainnetMarkets,
  resolveAllMarketBaskets,
  type MarketSnapshot,
} from "@kite/sdk";
import {
  isRedisConfigured,
  getRedisCatalog,
  setRedisCatalog,
  getRedisMarketSnapshot,
  setRedisMarketSnapshot,
} from "./redis";
import {
  isDiskCacheConfigured,
  getDiskCatalog,
  setDiskCatalog,
  getDiskMarketSnapshot,
  setDiskMarketSnapshot,
} from "./disk-cache";

type Deferred = (task: Promise<unknown>) => void;
const PRICE_TTL = 30_000;
const REFERENCE_TTL = 5 * 60_000;
const CATALOG_TTL = 3600_000;
let catalog: { value: MarketSnapshot; expiresAt: number } | null = null;
let catalogPending: Promise<MarketSnapshot> | null = null;
let cached: { value: MarketSnapshot; expiresAt: number } | null = null;
let pending: Promise<MarketSnapshot> | null = null;
let referencesExpireAt = 0;
const fallbackQuotes = new Map<string, number>();

/** Identity and issuer trading status never wait for the whole price universe. */
export async function getServerMarketCatalog(): Promise<MarketSnapshot> {
  if (catalog && catalog.expiresAt > Date.now()) return catalog.value;
  if (catalogPending) return catalogPending;
  catalogPending = getMainnetCatalog()
    .then((value) => {
      catalog = {
        value,
        expiresAt:
          Date.now() + (value.status === "unavailable" ? 5_000 : CATALOG_TTL),
      };
      if (value.assets.length) {
        void setRedisCatalog(value, 86400);
        void setDiskCatalog(value);
      }
      return value;
    })
    .finally(() => {
      catalogPending = null;
    });
  return catalogPending;
}

function retainReferences(value: MarketSnapshot): MarketSnapshot {
  const previous = new Map(
    cached?.value.assets.map((asset) => [asset.mint, asset]),
  );
  const assets = value.assets.map((asset) => {
    const old = previous.get(asset.mint);
    if (
      !old ||
      asset.underlyingPriceUsd != null ||
      old.underlyingPriceUsd == null
    )
      return asset;
    // These are labeled historical references. Never copy them into priceUsd,
    // or change their observation dates to make an old reference look fresh.
    return {
      ...asset,
      underlyingPriceUsd: old.underlyingPriceUsd,
      underlyingPriceUpdatedAt: old.underlyingPriceUpdatedAt,
      underlyingMarketCapUsd: old.underlyingMarketCapUsd,
      underlyingPriceSource: old.underlyingPriceSource,
      underlyingConfidenceUsd: old.underlyingConfidenceUsd,
      isRealTimePyth: old.isRealTimePyth,
    };
  });
  return { ...value, assets, baskets: resolveAllMarketBaskets(assets) };
}

function refresh(initial?: MarketSnapshot): Promise<MarketSnapshot> {
  if (pending) return pending;
  const includePriceReferences = referencesExpireAt <= Date.now();
  pending = (async () => {
    const identity = initial ?? (await getServerMarketCatalog());
    const publish = (value: MarketSnapshot) => {
      for (const asset of value.assets)
        if (asset.priceSource === "jupiter-price-v3" && asset.priceUsd !== null)
          fallbackQuotes.set(asset.mint, Date.now());
      for (const [mint, observedAt] of fallbackQuotes)
        if (Date.now() - observedAt > 15 * 60_000) fallbackQuotes.delete(mint);
      if (!value.assets.length && cached?.value.assets.length) {
        cached = {
          value: {
            ...cached.value,
            status: "partial",
            warnings: [
              ...new Set([
                ...cached.value.warnings,
                "Issuer catalogs are temporarily unavailable. Showing previously observed data.",
              ]),
            ],
          },
          expiresAt: Date.now() + 5_000,
        };
        return;
      }
      cached = {
        value: retainReferences(value),
        expiresAt: Date.now() + PRICE_TTL,
      };
      if (value.status !== "unavailable") {
        void setRedisMarketSnapshot(cached.value, 86400);
        void setDiskMarketSnapshot(cached.value);
      }
    };
    const value = await getMainnetMarkets({
      jupiterApiKey: process.env.JUPITER_API_KEY,
      pythApiKey: process.env.PYTH_API_KEY || process.env.HERMES_API_KEY,
      catalog: identity,
      includePriceReferences,
      priceFallbackMints: [...fallbackQuotes.keys()],
      onUpdate: publish,
    });
    publish(value);
    if (
      includePriceReferences &&
      (value.sources.includes("Jupiter Price V3") ||
        value.sources.includes("Pyth Network Oracles"))
    ) {
      referencesExpireAt =
        Date.now() +
        (value.warnings.some(
          (warning) =>
            warning.startsWith("Some Jupiter price and") ||
            warning.startsWith("Some Pyth price and"),
        )
          ? PRICE_TTL
          : REFERENCE_TTL);
    }
    return cached?.value ?? value;
  })()
    .catch((error) => {
      const previous = cached?.value ?? initial ?? catalog?.value;
      if (!previous) throw error;
      const value: MarketSnapshot = {
        ...previous,
        status: previous.assets.length ? "partial" : "unavailable",
        warnings: [
          ...new Set([
            ...previous.warnings,
            "Market refresh is temporarily unavailable. Showing previously observed data.",
          ]),
        ],
      };
      cached = { value, expiresAt: Date.now() + 5_000 };
      return value;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Public reads reuse observed data while a single refresh continues via Next after. */
export async function getServerMarkets(
  options: { waitUntil?: Deferred } = {},
): Promise<MarketSnapshot> {
  if (cached && cached.expiresAt > Date.now()) {
    if (pending) options.waitUntil?.(pending.catch(() => undefined));
    return { ...cached.value, refreshing: Boolean(pending) };
  }

  // 1. Check Redis for recent snapshot across lambdas
  if (!cached && isRedisConfigured()) {
    try {
      const fromRedis = await getRedisMarketSnapshot();
      if (
        fromRedis &&
        fromRedis.assets.length &&
        fromRedis.status !== "unavailable"
      ) {
        cached = {
          value: fromRedis,
          expiresAt: Date.now() + PRICE_TTL,
        };
      }
    } catch {
      // Non-blocking fallback
    }
  }

  // 2. Check Disk Cache for persistent snapshot (e.g. across server restarts / local dev)
  if (!cached && isDiskCacheConfigured()) {
    try {
      const fromDisk = await getDiskMarketSnapshot();
      if (
        fromDisk &&
        fromDisk.assets.length &&
        fromDisk.status !== "unavailable"
      ) {
        cached = {
          value: fromDisk,
          expiresAt: Date.now() + PRICE_TTL,
        };
      }
    } catch {
      // Non-blocking fallback
    }
  }

  const identity = cached ? undefined : await getServerMarketCatalog();
  if (identity && !identity.assets.length)
    return { ...identity, refreshing: false };
  const task = refresh(identity);
  if (!options.waitUntil) return { ...(await task), refreshing: false };
  options.waitUntil(task.catch(() => undefined));
  // Cold reads can render verified names immediately, before any Jupiter batch.
  return { ...(cached?.value ?? identity!), refreshing: true };
}
