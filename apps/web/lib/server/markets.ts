import {
  getMainnetCatalog,
  getMainnetMarkets,
  hasCompleteIssuerCatalogs,
  MAX_CUSTOM_BASKET_LEGS,
  resolveAllMarketBaskets,
  type MarketAsset,
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
const INCOMPLETE_CATALOG_TTL = 30_000;
let catalog: { value: MarketSnapshot; expiresAt: number } | null = null;
let catalogPending: Promise<MarketSnapshot> | null = null;
let cached: { value: MarketSnapshot; expiresAt: number } | null = null;
let pending: Promise<MarketSnapshot> | null = null;
let referencesExpireAt = 0;
const fallbackQuotes = new Map<string, number>();

/** Prices are observations; curated allocation definitions belong to this release. */
function withCurrentBasketDefinitions(
  snapshot: MarketSnapshot,
): MarketSnapshot {
  return { ...snapshot, baskets: resolveAllMarketBaskets(snapshot.assets) };
}

/** Identity and issuer trading status never wait for the whole price universe. */
export async function getServerMarketCatalog(): Promise<MarketSnapshot> {
  if (catalog && catalog.expiresAt > Date.now()) return catalog.value;
  if (catalogPending) return catalogPending;
  catalogPending = (async () => {
    // 1. Check Redis for cached catalog across instances
    if (isRedisConfigured()) {
      try {
        const fromRedis = await getRedisCatalog();
        if (
          fromRedis &&
          fromRedis.assets.length &&
          hasCompleteIssuerCatalogs(fromRedis) &&
          fromRedis.assets.some((a) => a.issuer === "xstocks")
        ) {
          const value = withCurrentBasketDefinitions(fromRedis);
          catalog = { value, expiresAt: Date.now() + CATALOG_TTL };
          return value;
        }
      } catch {
        // Non-blocking fallback
      }
    }

    // 2. Check Disk Cache for persistent catalog across server restarts
    if (isDiskCacheConfigured()) {
      try {
        const fromDisk = await getDiskCatalog();
        if (
          fromDisk &&
          fromDisk.assets.length &&
          hasCompleteIssuerCatalogs(fromDisk) &&
          fromDisk.assets.some((a) => a.issuer === "xstocks")
        ) {
          const value = withCurrentBasketDefinitions(fromDisk);
          catalog = { value, expiresAt: Date.now() + CATALOG_TTL };
          return value;
        }
      } catch {
        // Non-blocking fallback
      }
    }

    const value = withCurrentBasketDefinitions(await getMainnetCatalog());
    const complete = hasCompleteIssuerCatalogs(value);
    catalog = {
      value,
      expiresAt:
        Date.now() +
        (value.status === "unavailable"
          ? 5_000
          : complete
            ? CATALOG_TTL
            : INCOMPLETE_CATALOG_TTL),
    };
    // Preserve durable complete coverage during a temporary issuer outage.
    if (
      complete &&
      value.assets.length &&
      value.assets.some((a) => a.issuer === "xstocks")
    ) {
      await Promise.allSettled([
        setRedisCatalog(value, 86400),
        setDiskCatalog(value),
      ]);
    }
    return value;
  })().finally(() => {
    catalogPending = null;
  });
  return catalogPending;
}

const BASKET_PRICE_MAX_AGE_MS = 120_000;

function freshTokenPrice(
  asset: MarketAsset | undefined,
  now: number,
): number | null {
  if (
    !asset ||
    typeof asset.priceUsd !== "number" ||
    !Number.isFinite(asset.priceUsd) ||
    asset.priceUsd <= 0 ||
    !["jupiter-tokens-v2", "jupiter-price-v3", "prestocks-issuer"].includes(
      asset.priceSource ?? "",
    )
  )
    return null;
  const observedAt = Date.parse(asset.priceObservedAt ?? "");
  return Number.isFinite(observedAt) &&
    observedAt <= now &&
    now - observedAt <= BASKET_PRICE_MAX_AGE_MS
    ? asset.priceUsd
    : null;
}

/** Price only the reviewed issuer mints without replacing the full display cache. */
export async function getServerBasketPrices(
  identity: MarketSnapshot,
  mints: readonly string[],
): Promise<Map<string, number>> {
  const byMint = new Map(identity.assets.map((asset) => [asset.mint, asset]));
  if (
    identity.network !== "mainnet-beta" ||
    !Array.isArray(mints) ||
    !mints.length ||
    mints.length > MAX_CUSTOM_BASKET_LEGS ||
    new Set(mints).size !== mints.length ||
    mints.some((mint) => typeof mint !== "string" || !byMint.has(mint))
  )
    throw new Error(
      "Basket price requests must contain distinct reviewed catalog mints.",
    );

  const displayed = new Map(
    cached?.value.network === "mainnet-beta"
      ? cached.value.assets.map((asset) => [asset.mint, asset])
      : [],
  );
  const observations = new Map<string, MarketAsset>();
  const missing: MarketAsset[] = [];
  const now = Date.now();
  for (const mint of mints) {
    const known = byMint.get(mint)!;
    const current = displayed.get(mint);
    const candidates = [current, known].filter(
      (asset): asset is MarketAsset => freshTokenPrice(asset, now) !== null,
    );
    candidates.sort(
      (a, b) => Date.parse(b.priceObservedAt!) - Date.parse(a.priceObservedAt!),
    );
    if (candidates[0]) observations.set(mint, candidates[0]);
    else
      missing.push({
        ...known,
        priceUsd: null,
        priceObservedAt: null,
        priceSource: null,
        priceBlockId: null,
      });
  }
  if (missing.length) {
    try {
      const refreshed = await getMainnetMarkets({
        catalog: { ...identity, assets: missing, baskets: [] },
        jupiterApiKey: process.env.JUPITER_API_KEY,
        includePriceReferences: false,
        priceFallbackMints: missing.map((asset) => asset.mint),
        signal: AbortSignal.timeout(8_000),
      });
      const requested = new Set(missing.map((asset) => asset.mint));
      for (const asset of refreshed.assets)
        if (requested.has(asset.mint)) observations.set(asset.mint, asset);
    } catch {
      // Missing observations remain absent; the caller rejects incomplete baskets.
    }
  }
  const result = new Map<string, number>();
  const finishedAt = Date.now();
  for (const mint of mints) {
    const price = freshTokenPrice(observations.get(mint), finishedAt);
    if (price !== null) result.set(mint, price);
  }
  return result;
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
      if (
        value.status !== "unavailable" &&
        value.assets.some((a) => a.issuer === "xstocks")
      ) {
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
      value.status !== "unavailable" &&
      value.assets.some((a) => a.issuer === "xstocks") &&
      cached?.value
    ) {
      await Promise.allSettled([
        setRedisMarketSnapshot(cached.value, 86400),
        setDiskMarketSnapshot(cached.value),
      ]);
    }
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
        fromRedis.status !== "unavailable" &&
        fromRedis.assets.some((a) => a.issuer === "xstocks")
      ) {
        const age = Math.max(
          0,
          Date.now() - new Date(fromRedis.asOf).getTime(),
        );
        const remainingTtl = age < PRICE_TTL ? PRICE_TTL - age : 5_000;
        cached = {
          value: withCurrentBasketDefinitions(fromRedis),
          expiresAt: Date.now() + remainingTtl,
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
        fromDisk.status !== "unavailable" &&
        fromDisk.assets.some((a) => a.issuer === "xstocks")
      ) {
        const age = Math.max(0, Date.now() - new Date(fromDisk.asOf).getTime());
        const remainingTtl = age < PRICE_TTL ? PRICE_TTL - age : 5_000;
        cached = {
          value: withCurrentBasketDefinitions(fromDisk),
          expiresAt: Date.now() + remainingTtl,
        };
      }
    } catch {
      // Non-blocking fallback
    }
  }

  // If cached data was loaded from Redis or Disk, return it immediately if fresh
  if (cached && cached.expiresAt > Date.now()) {
    if (pending) options.waitUntil?.(pending.catch(() => undefined));
    return { ...cached.value, refreshing: Boolean(pending) };
  }

  const identity = cached ? cached.value : await getServerMarketCatalog();
  if (identity && !identity.assets.length)
    return { ...identity, refreshing: false };
  const task = refresh(identity);
  if (!options.waitUntil) return { ...(await task), refreshing: false };
  options.waitUntil(task.catch(() => undefined));
  // Cold reads can render verified names immediately, before any Jupiter batch.
  return { ...(cached?.value ?? identity!), refreshing: true };
}
