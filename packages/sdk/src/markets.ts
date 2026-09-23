import {
  getBackpackCatalog,
  BACKPACK_ASSETS_URL,
  type BackpackSecurity,
} from "./backpack";
import { hydratePythPrices } from "./pyth-oracle";
import { getBasketLiquidityAudit, type BasketLiquidityAudit } from "./basket/liquidity-audit";

/** Mainnet issuer catalogs and observed onchain market prices. Unknown values stay null. */
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface MarketAsset {
  mint: string;
  symbol: string;
  name: string;
  decimals: number | null;
  issuer: "xstocks" | "prestocks" | "backpack" | "other";
  kind: "equity" | "etf" | "pre-ipo" | "unknown";
  logoUrl: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  updatedAt: string | null;
  priceObservedAt: string | null;
  /** Source of the tradable token price; underlying share quotes are kept separate. */
  priceSource?:
    "jupiter-tokens-v2" | "jupiter-price-v3" | "prestocks-issuer" | null;
  priceBlockId?: number | null;
  underlyingPriceUsd?: number | null;
  underlyingPriceUpdatedAt?: string | null;
  underlyingMarketCapUsd?: number | null;
  underlyingPriceSource?: "pyth" | "jupiter-stock-data" | null;
  underlyingConfidenceUsd?: number | null;
  isRealTimePyth?: boolean;
  verified: boolean;
  sourceUrl: string;
  underlyingSymbol: string;
  tradingHalted: boolean;
  tradingNotice?: string;
}

export interface MarketBasket {
  id: string;
  name: string;
  ticker: string;
  description: string;
  category?:
    | "technology"
    | "consumer"
    | "healthcare"
    | "finance"
    | "industrials"
    | "energy"
    | "diversified"
    | "private"
    | "custom";
  assets: Array<{ asset: MarketAsset; weight: number }>;
  available: boolean;
  missingSymbols: string[];
  unpricedSymbols?: string[];
  liquidityAudit?: BasketLiquidityAudit;
  isCustom?: boolean;
  creatorName?: string;
  creatorSocial?: string;
}

export interface MarketSnapshot {
  assets: MarketAsset[];
  /** Exchange discovery is separate from the executable Solana token catalog. */
  backpackSecurities?: BackpackSecurity[];
  backpackObservedAt?: string;
  baskets: MarketBasket[];
  asOf: string;
  network: "mainnet-beta";
  sources: string[];
  status: "live" | "partial" | "unavailable";
  warnings: string[];
  /** More observed data is being fetched; existing timestamps are unchanged. */
  refreshing?: boolean;
}

export interface MarketOptions {
  jupiterApiKey?: string;
  jupiterBaseUrl?: string;
  pythApiKey?: string;
  pythBaseUrl?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  /** Reuse a separately verified issuer catalog without waiting for all prices. */
  catalog?: MarketSnapshot;
  /** Reference quotes refresh less frequently than token-market observations. */
  includePriceReferences?: boolean;
  /** Previously observed V3-priced tokens still need fresh token quotes. */
  priceFallbackMints?: readonly string[];
  /** Publishes token-market observations before optional reference enrichment. */
  onUpdate?: (snapshot: MarketSnapshot) => void;
}

type Row = Record<string, unknown>;
const CATALOG_TTL_MS = 10 * 60_000;
let xstocksCache: { assets: MarketAsset[]; expiresAt: number } | null = null;
let xstocksPending: Promise<MarketAsset[]> | null = null;
let prestockProductsCache: { products: Row[]; expiresAt: number } | null = null;
function row(value: unknown): Row {
  return value !== null && typeof value === "object" ? (value as Row) : {};
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function positive(value: unknown): number | null {
  const result = number(value);
  return result !== null && result > 0 ? result : null;
}
function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function validMint(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}
function logo(value: unknown): string | null {
  const url = string(value);
  return url.startsWith("https://") ? url : null;
}
function timestamp(value: unknown): string | null {
  const valueString = string(value);
  return valueString && Number.isFinite(Date.parse(valueString))
    ? valueString
    : null;
}
function nonnegative(value: unknown): number | null {
  const result = number(value);
  return result !== null && result >= 0 ? result : null;
}
function requestSignal(options: MarketOptions): AbortSignal {
  const timeout = AbortSignal.timeout(15_000);
  return options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
}

async function waitForRateLimit(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new Error("Market request deadline exceeded");
  await new Promise<void>((resolve, reject) => {
    const aborted = (): void => {
      clearTimeout(timer);
      reject(new Error("Market request deadline exceeded"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

function resolveJupiterApiKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.split(",").map((k) => k.trim()).find(Boolean);
}

async function request(url: string, options: MarketOptions): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const jupiterApiKey = resolveJupiterApiKey(options.jupiterApiKey);
  if (url.startsWith("https://api.jup.ag/") && jupiterApiKey)
    headers["x-api-key"] = jupiterApiKey;
  let response = await (options.fetcher ?? fetch)(url, {
    headers,
    signal: requestSignal(options),
  });
  // Jupiter shares its short rate-limit window across Tokens and Price requests.
  // Respect the actual reset; retrying a full catalog after one second loses whole batches.
  if (response.status === 429) {
    const retrySeconds = Number(response.headers.get("retry-after"));
    const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
    const resetDelay =
      Number.isFinite(resetSeconds) && resetSeconds > 0
        ? resetSeconds * 1000 - Date.now() + 100
        : 0;
    const requestedDelay =
      Number.isFinite(retrySeconds) && retrySeconds > 0
        ? retrySeconds * 1000
        : resetDelay > 0
          ? resetDelay
          : 1_000;
    const delayMs = Math.min(Math.max(requestedDelay, 100), 15_000);
    await waitForRateLimit(delayMs, options.signal);
    response = await (options.fetcher ?? fetch)(url, {
      headers,
      signal: requestSignal(options),
    });
  }
  if (!response.ok)
    throw new Error(`Market provider returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

function baseAsset(
  mint: string,
  symbol: string,
  name: string,
  issuer: MarketAsset["issuer"],
  sourceUrl: string,
): MarketAsset {
  return {
    mint,
    symbol,
    name,
    issuer,
    sourceUrl,
    decimals: null,
    kind: issuer === "prestocks" ? "pre-ipo" : "unknown",
    logoUrl: null,
    priceUsd: null,
    change24hPct: null,
    volume24hUsd: null,
    liquidityUsd: null,
    marketCapUsd: null,
    updatedAt: null,
    priceObservedAt: null,
    priceSource: null,
    priceBlockId: null,
    underlyingPriceUsd: null,
    underlyingPriceUpdatedAt: null,
    underlyingMarketCapUsd: null,
    verified: true,
    underlyingSymbol: symbol,
    tradingHalted: false,
  };
}

async function xstockCatalog(options: MarketOptions): Promise<MarketAsset[]> {
  if (!options.fetcher && xstocksCache && xstocksCache.expiresAt > Date.now())
    return xstocksCache.assets.map((asset) => ({ ...asset }));
  if (!options.fetcher && xstocksPending)
    return (await xstocksPending).map((asset) => ({ ...asset }));
  const operation = loadXstockCatalog(options);
  if (!options.fetcher) xstocksPending = operation;
  try {
    const assets = await operation;
    if (!options.fetcher)
      xstocksCache = { assets, expiresAt: Date.now() + CATALOG_TTL_MS };
    return assets.map((asset) => ({ ...asset }));
  } finally {
    if (!options.fetcher) xstocksPending = null;
  }
}

async function loadXstockCatalog(
  options: MarketOptions,
): Promise<MarketAsset[]> {
  const assets = new Map<string, MarketAsset>();
  const pageRequest = async (page: number): Promise<Row> => {
    const url = `https://api.xstocks.fi/api/v2/public/assets?network=Solana&page=${page}&pageSize=100`;
    const response = row(await request(url, options));
    if (!Array.isArray(response.nodes))
      throw new Error("xStocks catalog response is unavailable");
    return response;
  };
  // The issuer exposes hasNextPage, not a total page count. Speculate at most two pages ahead.
  for (let start = 0; start < 100; start += 3) {
    const pages = await Promise.allSettled(
      [start, start + 1, start + 2]
        .filter((page) => page < 100)
        .map(pageRequest),
    );
    for (const result of pages) {
      if (result.status === "rejected") throw result.reason;
      const response = result.value;
      for (const item of list(response.nodes)) {
        const value = row(item);
        const underlying = row(value.underlying);
        for (const deployment of list(value.deployments)) {
          const token = row(deployment);
          const mint = string(token.address);
          if (
            token.network !== "Solana" ||
            !validMint(mint) ||
            !string(value.symbol)
          )
            continue;
          const asset = baseAsset(
            mint,
            string(value.symbol),
            string(value.name),
            "xstocks",
            "https://api.xstocks.fi/api/v2/public/assets",
          );
          asset.logoUrl = logo(value.logo);
          asset.underlyingSymbol =
            string(underlying.symbol) ||
            string(value.underlyingSymbol) ||
            asset.symbol.replace(/x$/, "");
          asset.kind =
            underlying.type === "ETF"
              ? "etf"
              : underlying.type === "Equity"
                ? "equity"
                : "unknown";
          asset.tradingHalted = value.isTradingHalted === true;
          assets.set(mint, asset);
        }
      }
      if (row(response.page).hasNextPage !== true) return [...assets.values()];
    }
  }
  throw new Error("xStocks catalog pagination exceeded its safety limit");
}

async function getPrestockProducts(options: MarketOptions): Promise<Row[]> {
  if (
    !options.fetcher &&
    prestockProductsCache &&
    prestockProductsCache.expiresAt > Date.now()
  )
    return prestockProductsCache.products;
  const response = await (options.fetcher ?? fetch)(
    "https://prestocks.com/products",
    { signal: requestSignal(options) },
  );
  if (!response.ok)
    throw new Error("PreStocks product metadata is unavailable");
  const products = parsePrestockProducts(await response.text());
  if (!products.length)
    throw new Error("PreStocks product metadata could not be verified");
  if (!options.fetcher)
    prestockProductsCache = {
      products,
      expiresAt: Date.now() + CATALOG_TTL_MS,
    };
  return products;
}

async function prestockCatalog(options: MarketOptions): Promise<MarketAsset[]> {
  const [metricsResult, productsResult] = await Promise.allSettled([
    request("https://prestocks.com/api/metrics", options).then((value) => ({
      value,
      observedAt: new Date().toISOString(),
    })),
    getPrestockProducts(options),
  ]);
  if (metricsResult.status === "rejected")
    throw new Error("PreStocks metrics are unavailable");
  const response = row(metricsResult.value.value);
  const observedAt = metricsResult.value.observedAt;
  const products =
    productsResult.status === "fulfilled" ? productsResult.value : [];
  const metadata = new Map(
    products.map((value) => [string(value.splMint), value]),
  );
  if (!Array.isArray(response.metrics))
    throw new Error("PreStocks catalog response is unavailable");
  return response.metrics.flatMap((item) => {
    const value = row(item);
    const mint = string(value.splMint);
    const symbol = string(value.symbol);
    if (!validMint(mint) || !symbol) return [];
    const asset = baseAsset(
      mint,
      symbol,
      symbol,
      "prestocks",
      "https://prestocks.com/products",
    );
    const product = metadata.get(mint);
    if (product) {
      asset.name = string(product.name) || symbol;
      const decimals = number(product.decimals);
      asset.decimals =
        decimals !== null &&
        Number.isInteger(decimals) &&
        decimals >= 0 &&
        decimals <= 18
          ? decimals
          : null;
      const productLogo = string(product.productLogo);
      asset.logoUrl = productLogo.startsWith("/ui/")
        ? `https://prestocks.com${productLogo}`
        : logo(productLogo);
    }
    // The issuer retains metrics for converted/withdrawn products. Those are visible, but not new trade targets.
    asset.tradingHalted =
      !product ||
      product.skipPipeline === true ||
      product.hideOnPrestocksApi === true;
    if (asset.tradingHalted)
      asset.tradingNotice = product
        ? "The issuer has paused or withdrawn this product. Check its product page for conversion terms."
        : "Issuer trading status is unavailable. Trading is disabled until it can be verified.";
    asset.priceUsd = positive(value.tokenPrice);
    asset.priceSource = asset.priceUsd === null ? null : "prestocks-issuer";
    asset.marketCapUsd = number(value.marketCapUSD);
    asset.priceObservedAt = asset.priceUsd === null ? null : observedAt;
    return [asset];
  });
}

/** Read public server-rendered product JSON; never execute the issuer's JavaScript. */
function parsePrestockProducts(html: string): Row[] {
  const chunks: string[] = [];
  const scriptPattern =
    /<script\b[^>]*>self\.__next_f\.push\((.*?)\)<\/script>/gs;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      const value: unknown = JSON.parse(match[1]);
      if (Array.isArray(value) && typeof value[1] === "string")
        chunks.push(value[1]);
    } catch {
      /* Ignore non-JSON script tags. */
    }
  }
  const products: Row[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = row(value);
    if (Array.isArray(object.products))
      products.push(...object.products.map(row));
    else Object.values(object).forEach(walk);
  };
  for (const line of chunks.join("").split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0 || !line.includes('"products":')) continue;
    try {
      walk(JSON.parse(line.slice(separator + 1)));
    } catch {
      /* Schema drift fails closed for new trading. */
    }
  }
  return products;
}

/** Canonical baskets also back devnet test plans; never silently rewrite their IDs. */
export function resolveMarketBaskets(
  assets: MarketAsset[],
  options: { reviewedOnly?: boolean; includeAll?: boolean } = {},
): MarketBasket[] {
  const definitions: Array<{
    id: string;
    name: string;
    ticker: string;
    description: string;
    symbols: string[];
    issuer: MarketAsset["issuer"];
    category: MarketBasket["category"];
  }> = [
    {
      id: "sol-ai-infra",
      name: "Intelligence Layer",
      ticker: "SOL-AI",
      category: "technology",
      description:
        "Compute and cloud platforms behind artificial intelligence. Equal allocations across five companies.",
      symbols: ["NVDA", "MSFT", "GOOGL", "AMZN", "ORCL"],
      issuer: "xstocks",
    },
    {
      id: "sol-chips",
      name: "The Silicon Stack",
      ticker: "SOL-CHIPS",
      category: "technology",
      description:
        "From chip design to fabrication and lithography: five links in the semiconductor supply chain, equally weighted.",
      symbols: ["NVDA", "AMD", "AVGO", "TSM", "ASML"],
      issuer: "xstocks",
    },
    {
      id: "sol-cloud",
      name: "Work in the Cloud",
      ticker: "SOL-CLOUD",
      category: "technology",
      description:
        "Enterprise software, databases and business workflows. Equal allocations across Microsoft, Salesforce, Oracle and ServiceNow.",
      symbols: ["MSFT", "CRM", "ORCL", "NOW"],
      issuer: "xstocks",
    },
    {
      id: "sol-everyday",
      name: "Everyday Economy",
      ticker: "SOL-LIFE",
      category: "consumer",
      description:
        "Devices, shopping, meals and drinks that connect companies to everyday spending. Five equal allocations.",
      symbols: ["AAPL", "AMZN", "MCD", "SBUX", "KO"],
      issuer: "xstocks",
    },
    {
      id: "sol-health",
      name: "Health, Ahead",
      ticker: "SOL-HEALTH",
      category: "healthcare",
      description:
        "Medicines, medical products and healthcare services. Equal exposure across five healthcare companies.",
      symbols: ["LLY", "JNJ", "ABBV", "UNH", "MRK"],
      issuer: "xstocks",
    },
    {
      id: "sol-finance",
      name: "Money in Motion",
      ticker: "SOL-FIN",
      category: "finance",
      description:
        "Banking, capital markets and payment networks. Four equal allocations to the infrastructure of finance.",
      symbols: ["JPM", "GS", "V", "MA"],
      issuer: "xstocks",
    },
    {
      id: "sol-defense",
      name: "Strategic Systems",
      ticker: "SOL-DEF",
      category: "industrials",
      description:
        "Aerospace, defense systems and data software. Equal allocations across Lockheed Martin, RTX, Northrop Grumman and Palantir.",
      symbols: ["LMT", "RTX", "NOC", "PLTR"],
      issuer: "xstocks",
    },
    {
      id: "sol-energy",
      name: "Energy Backbone",
      ticker: "SOL-ENERGY",
      category: "energy",
      description:
        "Three energy producers with equal allocations. A focused energy thesis with exposure to commodity cycles.",
      symbols: ["XOM", "CVX", "COP"],
      issuer: "xstocks",
    },
    {
      id: "sol-industry",
      name: "Built to Move",
      ticker: "SOL-BUILD",
      category: "industrials",
      description:
        "Machinery, agriculture, aerospace and industrial systems. Equal allocations to Caterpillar, Deere, GE Aerospace and Honeywell.",
      symbols: ["CAT", "DE", "GE", "HON"],
      issuer: "xstocks",
    },
    {
      id: "sol-core",
      name: "A Wider Lens",
      ticker: "SOL-CORE",
      category: "diversified",
      description:
        "Equal allocations to S&P 500, Nasdaq-100 and gold exposure through issuer-listed ETF tokens. Index holdings overlap.",
      symbols: ["SPY", "QQQ", "GLD"],
      issuer: "xstocks",
    },
    {
      id: "sol-pre-stocks",
      name: "Private Frontiers",
      ticker: "SOL-PRE",
      category: "private",
      description:
        "Equal allocations across the currently published PreStocks catalog. Private company exposure carries distinct risks.",
      symbols: [
        ...new Set(
          assets
            .filter(
              (asset) => asset.issuer === "prestocks" && !asset.tradingHalted,
            )
            .map((asset) => asset.underlyingSymbol),
        ),
      ].sort(),
      issuer: "prestocks",
    },
  ];
  // New IDs keep existing paper/devnet plans tied to their original allocations.
  // Mainnet publishes only the subsets reviewed in docs/basket-liquidity-audit.md.
  const reviewed: typeof definitions = [
    {
      id: "sol-digital-leaders",
      name: "Digital Leaders",
      ticker: "SOL-DIGITAL",
      category: "technology",
      description:
        "Three equal allocations to Apple, Microsoft and NVIDIA. A focused selection from the largest technology companies.",
      symbols: ["AAPL", "MSFT", "NVDA"],
      issuer: "xstocks",
    },
    {
      id: "sol-ai-focused",
      name: "AI Platforms",
      ticker: "SOL-AI3",
      category: "technology",
      description:
        "NVIDIA, Alphabet and Amazon, equally weighted. A focused selection across AI compute and cloud platforms.",
      symbols: ["NVDA", "GOOGL", "AMZN"],
      issuer: "xstocks",
    },
    {
      id: "sol-everyday-focused",
      name: "Everyday Essentials",
      ticker: "SOL-LIFE3",
      category: "consumer",
      description:
        "Apple, Amazon and Coca-Cola, equally weighted. Three companies spanning devices, shopping and everyday consumption.",
      symbols: ["AAPL", "AMZN", "KO"],
      issuer: "xstocks",
    },
    definitions.find((definition) => definition.id === "sol-core")!,
  ];
  const sourceDefinitions = options.reviewedOnly
    ? reviewed
    : options.includeAll
      ? [...reviewed, ...definitions.filter((d) => d.id !== "sol-core")]
      : definitions;

  return sourceDefinitions.map((definition) => {
    const found = definition.symbols.map((symbol) =>
      assets.find(
        (asset) =>
          asset.issuer === definition.issuer &&
          asset.underlyingSymbol.toUpperCase() === symbol.toUpperCase(),
      ),
    );
    const missingSymbols = definition.symbols.filter(
      (_, index) => !found[index],
    );
    const count = definition.symbols.length;
    const members = found.flatMap((asset, index) =>
      asset
        ? [
            {
              asset,
              weight:
                Math.floor(10_000 / count) + (index < 10_000 % count ? 1 : 0),
            },
          ]
        : [],
    );
    const unpricedSymbols = members
      .filter(({ asset }) => positive(asset.priceUsd) === null)
      .map(({ asset }) => asset.underlyingSymbol);
    return {
      id: definition.id,
      name: definition.name,
      ticker: definition.ticker,
      category: definition.category,
      description: definition.description,
      assets: members,
      missingSymbols,
      unpricedSymbols,
      available:
        count > 0 &&
        missingSymbols.length === 0 &&
        unpricedSymbols.length === 0 &&
        members.every(({ asset }) => !asset.tradingHalted),
      liquidityAudit: getBasketLiquidityAudit(definition.id),
    };
  });
}

/** Fresh order construction still validates every leg, amount and atomic transaction. */
export function resolveReviewedMarketBaskets(
  assets: MarketAsset[],
): MarketBasket[] {
  return resolveMarketBaskets(assets, { reviewedOnly: true });
}

export function resolveAllMarketBaskets(
  assets: MarketAsset[],
): MarketBasket[] {
  return resolveMarketBaskets(assets, { includeAll: true });
}

/** Issuer identity does not depend on Jupiter prices or token metadata. */
export async function getMainnetCatalog(
  options: MarketOptions = {},
): Promise<MarketSnapshot> {
  const withDeadline = (milliseconds: number): MarketOptions => {
    const deadline = AbortSignal.timeout(milliseconds);
    return {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, deadline])
        : deadline,
    };
  };
  // xStocks requires several paginated batches. An eight-second total deadline
  // could discard a healthy catalog while its final response bodies arrived.
  // Other issuer metadata keeps its shorter budget; caller cancellation wins.
  const paginatedOptions = withDeadline(20_000);
  const metadataOptions = withDeadline(8_000);
  const warnings: string[] = [];
  const sources: string[] = [];
  const [catalogs, backpack] = await Promise.all([
    Promise.allSettled([
      xstockCatalog(paginatedOptions),
      prestockCatalog(metadataOptions),
    ]),
    getBackpackCatalog(metadataOptions).then(
      (value) => ({ status: "fulfilled" as const, value }),
      () => ({ status: "rejected" as const }),
    ),
  ]);
  const byMint = new Map<string, MarketAsset>();
  catalogs.forEach((result, index) => {
    if (result.status === "fulfilled") {
      result.value.forEach((asset) => byMint.set(asset.mint, asset));
      sources.push(
        index === 0 ? "xStocks issuer catalog" : "PreStocks issuer catalog",
      );
    } else
      warnings.push(
        `${index === 0 ? "xStocks" : "PreStocks"} catalog could not be loaded. Retry to discover its assets.`,
      );
  });
  if (backpack.status === "fulfilled") {
    sources.push("Backpack securities catalog");
    if (backpack.value.mappingsAvailable)
      sources.push("Backpack Solana mappings");
    warnings.push(...backpack.value.warnings);
    for (const security of backpack.value.securities) {
      if (
        security.discoveryOnly ||
        !security.solanaMint ||
        byMint.has(security.solanaMint)
      )
        continue;
      const asset = baseAsset(
        security.solanaMint,
        security.symbol,
        security.name,
        "backpack",
        BACKPACK_ASSETS_URL,
      );
      asset.underlyingSymbol = security.underlyingSymbol;
      asset.decimals = security.decimals;
      // /securities does not publish a reliable equity/ETF classification.
      // The mint's program, extensions and precision are checked again before trading.
      byMint.set(asset.mint, asset);
    }
  } else
    warnings.push(
      "Backpack securities catalog could not be loaded. Retry to discover its listings.",
    );
  const assets = [...byMint.values()];
  return {
    assets,
    backpackSecurities:
      backpack.status === "fulfilled" ? backpack.value.securities : [],
    backpackObservedAt:
      backpack.status === "fulfilled" ? backpack.value.observedAt : undefined,
    baskets: resolveMarketBaskets(assets, { includeAll: true }),
    asOf: new Date().toISOString(),
    network: "mainnet-beta",
    sources,
    status:
      assets.length === 0 &&
      !(backpack.status === "fulfilled" && backpack.value.securities.length)
        ? "unavailable"
        : warnings.length
          ? "partial"
          : "live",
    warnings,
  };
}

/** Prices and metadata are requested only for mints obtained from the issuers themselves. */
export async function getMainnetMarkets(
  options: MarketOptions = {},
): Promise<MarketSnapshot> {
  const deadline = AbortSignal.timeout(30_000);
  options = {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, deadline])
      : deadline,
  };
  const catalog = options.catalog ?? (await getMainnetCatalog(options));
  const warnings = [...catalog.warnings];
  const sources = [...catalog.sources];
  const byMint = new Map(
    catalog.assets.map((asset) => [asset.mint, { ...asset }]),
  );
  const mints = [...byMint.keys()];
  const base =
    options.jupiterBaseUrl ??
    (resolveJupiterApiKey(options.jupiterApiKey)
      ? "https://api.jup.ag"
      : "https://lite-api.jup.ag");
  if (!/^https:\/\/(api|lite-api)\.jup\.ag$/.test(base))
    throw new Error("Unsupported Jupiter API origin");
  const batches: string[][] = [];
  for (let index = 0; index < mints.length; index += 100)
    batches.push(mints.slice(index, index + 100));
  // Bound concurrency to three rather than serializing hundreds of mints or flooding the provider.
  const hydrateBatch = async (batch: string[]): Promise<void> => {
    try {
      const payload = await request(
        `${base}/tokens/v2/search?query=${batch.join(",")}`,
        options,
      );
      if (!Array.isArray(payload))
        throw new Error("Jupiter token data is unavailable");
      const observedAt = new Date().toISOString();
      for (const item of payload) {
        const token = row(item);
        const asset = byMint.get(string(token.id));
        if (!asset) continue;
        const decimals = number(token.decimals);
        asset.decimals =
          decimals !== null &&
          Number.isInteger(decimals) &&
          decimals >= 0 &&
          decimals <= 18
            ? decimals
            : asset.decimals;
        asset.name = string(token.name) || asset.name;
        asset.logoUrl = logo(token.icon) ?? asset.logoUrl;
        const price = positive(token.usdPrice);
        if (price !== null) {
          asset.priceUsd = price;
          asset.priceObservedAt = observedAt;
          asset.priceSource = "jupiter-tokens-v2";
          asset.priceBlockId = nonnegative(token.priceBlockId);
        }
        const stats = row(token.stats24h);
        asset.change24hPct = number(stats.priceChange);
        const buy = nonnegative(stats.buyVolume),
          sell = nonnegative(stats.sellVolume);
        asset.volume24hUsd = buy !== null && sell !== null ? buy + sell : null;
        asset.liquidityUsd = nonnegative(token.liquidity);
        asset.marketCapUsd = nonnegative(token.mcap) ?? asset.marketCapUsd;
        asset.updatedAt = timestamp(token.updatedAt);
      }
      if (!sources.includes("Jupiter Tokens V2"))
        sources.push("Jupiter Tokens V2");
    } catch {
      warnings.push(
        "Some Jupiter prices and token metadata are unavailable. Unpriced assets cannot be traded in paper mode.",
      );
    }
  };
  for (let index = 0; index < batches.length; index += 3)
    await Promise.all(batches.slice(index, index + 3).map(hydrateBatch));
  options.onUpdate?.(snapshot());

  const pythKey =
    options.pythApiKey ||
    (typeof process !== "undefined"
      ? process.env?.PYTH_API_KEY || process.env?.HERMES_API_KEY
      : undefined);
  if (options.includePriceReferences !== false && pythKey) {
    try {
      const pythResult = await hydratePythPrices([...byMint.values()], {
        hermesApiKey: pythKey,
        hermesBaseUrl: options.pythBaseUrl,
      });
      if (pythResult.count > 0 && !sources.includes("Pyth Network Oracles")) {
        sources.push("Pyth Network Oracles");
      }
    } catch {
      // Graceful fallback to Jupiter Price V3 stockData below
    }
  }

  const fallbackMints = new Set(options.priceFallbackMints ?? []);
  const priceMints =
    options.includePriceReferences === false
      ? mints.filter(
          (mint) =>
            fallbackMints.has(mint) &&
            byMint.get(mint)?.priceSource !== "jupiter-tokens-v2",
        )
      : mints;
  if (!priceMints.length) return snapshot();
  // Price V3 also supplies issuer-backed underlying reference quotes for xStocks
  // with no recent onchain swap. Never turn those references into token fills.
  const priceBatches: string[][] = [];
  for (let index = 0; index < priceMints.length; index += 50)
    priceBatches.push(priceMints.slice(index, index + 50));
  const hydratePrices = async (batch: string[]): Promise<void> => {
    try {
      const payload = await request(
        `${base}/price/v3?ids=${batch.join(",")}`,
        options,
      );
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("Jupiter price data is unavailable");
      const prices = row(payload);
      const observedAt = new Date().toISOString();
      for (const mint of batch) {
        const asset = byMint.get(mint);
        if (!asset) continue;
        const value = row(prices[mint]);
        const price = positive(value.usdPrice);
        const decimals = number(value.decimals);
        asset.decimals =
          decimals !== null &&
          Number.isInteger(decimals) &&
          decimals >= 0 &&
          decimals <= 18
            ? decimals
            : asset.decimals;
        if (price !== null) {
          asset.priceUsd = price;
          asset.priceObservedAt = observedAt;
          asset.priceSource = "jupiter-price-v3";
          asset.priceBlockId = nonnegative(value.blockId);
          asset.change24hPct =
            number(value.priceChange24h) ?? asset.change24hPct;
          asset.liquidityUsd =
            nonnegative(value.liquidity) ?? asset.liquidityUsd;
        }
        const stock = row(value.stockData);
        if (
          asset.issuer === "xstocks" &&
          stock.id === "xstocks" &&
          asset.underlyingPriceSource !== "pyth"
        ) {
          asset.underlyingPriceUsd = positive(stock.price);
          asset.underlyingPriceUpdatedAt = timestamp(stock.updatedAt);
          asset.underlyingMarketCapUsd = nonnegative(stock.mcap);
          asset.underlyingPriceSource = "jupiter-stock-data";
        }
      }
      if (!sources.includes("Jupiter Price V3"))
        sources.push("Jupiter Price V3");
    } catch {
      warnings.push(
        "Some Jupiter price and underlying reference quotes are unavailable. Available token metadata is retained.",
      );
    }
  };
  for (let index = 0; index < priceBatches.length; index += 3)
    await Promise.all(priceBatches.slice(index, index + 3).map(hydratePrices));
  return snapshot();

  function snapshot(): MarketSnapshot {
    // Detach progressive responses from the objects still being enriched.
    const assets = [...byMint.values()]
      .map((asset) => ({ ...asset }))
      .sort(
        (a, b) =>
          (b.volume24hUsd ?? -1) - (a.volume24hUsd ?? -1) ||
          a.symbol.localeCompare(b.symbol),
      );
    const snapshotWarnings = [...warnings];
    const unpriced = assets.filter((asset) => asset.priceUsd === null).length;
    if (unpriced > 0)
      snapshotWarnings.push(
        `${unpriced} issuer-listed assets have no observed token market price. Underlying reference quotes are shown separately where available and cannot fund paper trades.`,
      );
    if (assets.some((asset) => asset.tradingHalted))
      snapshotWarnings.push(
        "Paused, converted, or unverified-status issuer products are listed for reference with trading disabled.",
      );
    return {
      assets,
      backpackSecurities: catalog.backpackSecurities,
      backpackObservedAt: catalog.backpackObservedAt,
      baskets: resolveMarketBaskets(assets, { includeAll: true }),
      asOf: new Date().toISOString(),
      network: "mainnet-beta",
      sources: [...sources],
      status:
        assets.length === 0 && !catalog.backpackSecurities?.length
          ? "unavailable"
          : snapshotWarnings.length
            ? "partial"
            : "live",
      warnings: [...new Set(snapshotWarnings)],
    };
  }
}
