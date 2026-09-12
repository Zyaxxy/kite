/** Mainnet issuer catalogs and observed onchain market prices. Unknown values stay null. */
export const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface MarketAsset {
  mint: string;
  symbol: string;
  name: string;
  decimals: number | null;
  issuer: 'xstocks' | 'prestocks' | 'other';
  kind: 'equity' | 'etf' | 'pre-ipo' | 'unknown';
  logoUrl: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  updatedAt: string | null;
  priceObservedAt: string | null;
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
  assets: Array<{ asset: MarketAsset; weight: number }>;
  available: boolean;
  missingSymbols: string[];
}

export interface MarketSnapshot {
  assets: MarketAsset[];
  baskets: MarketBasket[];
  asOf: string;
  network: 'mainnet-beta';
  sources: string[];
  status: 'live' | 'partial' | 'unavailable';
  warnings: string[];
}

export interface MarketOptions {
  jupiterApiKey?: string;
  jupiterBaseUrl?: string;
  fetcher?: typeof fetch;
}

type Row = Record<string, unknown>;
const CATALOG_TTL_MS = 10 * 60_000;
let xstocksCache: { assets: MarketAsset[]; expiresAt: number } | null = null;
let xstocksPending: Promise<MarketAsset[]> | null = null;
let prestockProductsCache: { products: Row[]; expiresAt: number } | null = null;
function row(value: unknown): Row { return value !== null && typeof value === 'object' ? value as Row : {}; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function number(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function positive(value: unknown): number | null { const result = number(value); return result !== null && result > 0 ? result : null; }
function string(value: unknown): string { return typeof value === 'string' ? value : ''; }
function validMint(value: string): boolean { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value); }
function logo(value: unknown): string | null { const url = string(value); return url.startsWith('https://') ? url : null; }

async function request(url: string, options: MarketOptions): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (url.startsWith('https://api.jup.ag/') && options.jupiterApiKey) headers['x-api-key'] = options.jupiterApiKey;
  const response = await (options.fetcher ?? fetch)(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Market provider returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

function baseAsset(mint: string, symbol: string, name: string, issuer: MarketAsset['issuer'], sourceUrl: string): MarketAsset {
  return { mint, symbol, name, issuer, sourceUrl, decimals: null, kind: issuer === 'prestocks' ? 'pre-ipo' : 'unknown', logoUrl: null, priceUsd: null, change24hPct: null, volume24hUsd: null, liquidityUsd: null, marketCapUsd: null, updatedAt: null, priceObservedAt: null, verified: true, underlyingSymbol: symbol, tradingHalted: false };
}

async function xstockCatalog(options: MarketOptions): Promise<MarketAsset[]> {
  if (!options.fetcher && xstocksCache && xstocksCache.expiresAt > Date.now()) return xstocksCache.assets.map(asset => ({...asset}));
  if (!options.fetcher && xstocksPending) return (await xstocksPending).map(asset => ({...asset}));
  const operation = loadXstockCatalog(options);
  if (!options.fetcher) xstocksPending = operation;
  try {
    const assets = await operation;
    if (!options.fetcher) xstocksCache = { assets, expiresAt: Date.now() + CATALOG_TTL_MS };
    return assets.map(asset => ({...asset}));
  } finally { if (!options.fetcher) xstocksPending = null; }
}

async function loadXstockCatalog(options: MarketOptions): Promise<MarketAsset[]> {
  const assets = new Map<string, MarketAsset>();
  const pageRequest = async (page: number): Promise<Row> => {
    const url = `https://api.xstocks.fi/api/v2/public/assets?network=Solana&page=${page}&pageSize=100`;
    const response = row(await request(url, options));
    if (!Array.isArray(response.nodes)) throw new Error('xStocks catalog response is unavailable');
    return response;
  };
  // The issuer exposes hasNextPage, not a total page count. Speculate at most two pages ahead.
  for (let start = 0; start < 100; start += 3) {
    const pages = await Promise.allSettled([start,start+1,start+2].filter(page => page < 100).map(pageRequest));
    for (const result of pages) {
      if (result.status === 'rejected') throw result.reason;
      const response = result.value;
      for (const item of list(response.nodes)) {
        const value = row(item);
        const underlying = row(value.underlying);
        for (const deployment of list(value.deployments)) {
          const token = row(deployment);
          const mint = string(token.address);
          if (token.network !== 'Solana' || !validMint(mint) || !string(value.symbol)) continue;
          const asset = baseAsset(mint, string(value.symbol), string(value.name), 'xstocks', 'https://api.xstocks.fi/api/v2/public/assets');
          asset.logoUrl = logo(value.logo);
          asset.underlyingSymbol = string(underlying.symbol) || string(value.underlyingSymbol) || asset.symbol.replace(/x$/, '');
          asset.kind = underlying.type === 'ETF' ? 'etf' : underlying.type === 'Equity' ? 'equity' : 'unknown';
          asset.tradingHalted = value.isTradingHalted === true;
          assets.set(mint, asset);
        }
      }
      if (row(response.page).hasNextPage !== true) return [...assets.values()];
    }
  }
  throw new Error('xStocks catalog pagination exceeded its safety limit');
}

async function getPrestockProducts(options: MarketOptions): Promise<Row[]> {
  if (!options.fetcher && prestockProductsCache && prestockProductsCache.expiresAt > Date.now()) return prestockProductsCache.products;
  const response = await (options.fetcher ?? fetch)('https://prestocks.com/products', { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('PreStocks product metadata is unavailable');
  const products = parsePrestockProducts(await response.text());
  if (!products.length) throw new Error('PreStocks product metadata could not be verified');
  if (!options.fetcher) prestockProductsCache = { products, expiresAt: Date.now() + CATALOG_TTL_MS };
  return products;
}

async function prestockCatalog(options: MarketOptions): Promise<MarketAsset[]> {
  const [metricsResult, productsResult] = await Promise.allSettled([
    request('https://prestocks.com/api/metrics', options).then(value => ({value, observedAt: new Date().toISOString()})),
    getPrestockProducts(options),
  ]);
  if (metricsResult.status === 'rejected') throw new Error('PreStocks metrics are unavailable');
  const response = row(metricsResult.value.value);
  const observedAt = metricsResult.value.observedAt;
  const products = productsResult.status === 'fulfilled' ? productsResult.value : [];
  const metadata = new Map(products.map(value => [string(value.splMint), value]));
  if (!Array.isArray(response.metrics)) throw new Error('PreStocks catalog response is unavailable');
  return response.metrics.flatMap(item => {
    const value = row(item);
    const mint = string(value.splMint);
    const symbol = string(value.symbol);
    if (!validMint(mint) || !symbol) return [];
    const asset = baseAsset(mint, symbol, symbol, 'prestocks', 'https://prestocks.com/products');
    const product = metadata.get(mint);
    if (product) {
      asset.name = string(product.name) || symbol;
      const decimals = number(product.decimals);
      asset.decimals = decimals !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 18 ? decimals : null;
      const productLogo = string(product.productLogo);
      asset.logoUrl = productLogo.startsWith('/ui/') ? `https://prestocks.com${productLogo}` : logo(productLogo);
    }
    // The issuer retains metrics for converted/withdrawn products. Those are visible, but not new trade targets.
    asset.tradingHalted = !product || product.skipPipeline === true || product.hideOnPrestocksApi === true;
    if (asset.tradingHalted) asset.tradingNotice = product ? 'The issuer has paused or withdrawn this product. Check its product page for conversion terms.' : 'Issuer trading status is unavailable. Trading is disabled until it can be verified.';
    asset.priceUsd = positive(value.tokenPrice);
    asset.marketCapUsd = number(value.marketCapUSD);
    asset.priceObservedAt = asset.priceUsd === null ? null : observedAt;
    return [asset];
  });
}

/** Read public server-rendered product JSON; never execute the issuer's JavaScript. */
function parsePrestockProducts(html: string): Row[] {
  const chunks: string[] = [];
  const scriptPattern = /<script\b[^>]*>self\.__next_f\.push\((.*?)\)<\/script>/gs;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      const value: unknown = JSON.parse(match[1]);
      if (Array.isArray(value) && typeof value[1] === 'string') chunks.push(value[1]);
    } catch { /* Ignore non-JSON script tags. */ }
  }
  const products: Row[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const object = row(value);
    if (Array.isArray(object.products)) products.push(...object.products.map(row));
    else Object.values(object).forEach(walk);
  };
  for (const line of chunks.join('').split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 0 || !line.includes('"products":')) continue;
    try { walk(JSON.parse(line.slice(separator + 1))); } catch { /* Schema drift fails closed for new trading. */ }
  }
  return products;
}

/** Baskets are allocation definitions, not fabricated token mints or return histories. */
export function resolveMarketBaskets(assets: MarketAsset[]): MarketBasket[] {
  const definitions = [
    { id: 'sol-mag7', name: 'The Magnificent Seven', ticker: 'SOL-MAG7', description: 'Seven companies shaping the digital economy. Equal allocations to their mainnet xStocks.', symbols: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'], issuer: 'xstocks' },
    { id: 'sol-ai-infra', name: 'Intelligence Layer', ticker: 'SOL-AI', description: 'Compute, cloud and the infrastructure behind artificial intelligence.', symbols: ['NVDA', 'MSFT', 'GOOGL'], issuer: 'xstocks' },
    { id: 'sol-pre-stocks', name: 'Private Frontiers', ticker: 'SOL-PRE', description: 'Equal allocations across the currently published PreStocks catalog. Private company exposure carries distinct risks.', symbols: assets.filter(asset => asset.issuer === 'prestocks' && !asset.tradingHalted).map(asset => asset.underlyingSymbol), issuer: 'prestocks' },
  ];
  return definitions.map(definition => {
    const found = definition.symbols.map(symbol => assets.find(asset => asset.issuer === definition.issuer && asset.underlyingSymbol.toUpperCase() === symbol.toUpperCase()));
    const missingSymbols = definition.symbols.filter((_, index) => !found[index]);
    const count = definition.symbols.length;
    const members = found.flatMap((asset, index) => asset ? [{ asset, weight: Math.floor(10_000 / count) + (index < 10_000 % count ? 1 : 0) }] : []);
    return { id: definition.id, name: definition.name, ticker: definition.ticker, description: definition.description, assets: members, missingSymbols, available: count > 0 && missingSymbols.length === 0 && members.every(({asset}) => asset.priceUsd !== null && !asset.tradingHalted) };
  });
}

/** Prices and metadata are requested only for mints obtained from the issuers themselves. */
export async function getMainnetMarkets(options: MarketOptions = {}): Promise<MarketSnapshot> {
  const warnings: string[] = [];
  const sources: string[] = [];
  const catalogs = await Promise.allSettled([xstockCatalog(options), prestockCatalog(options)]);
  const byMint = new Map<string, MarketAsset>();
  catalogs.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      result.value.forEach(asset => byMint.set(asset.mint, asset));
      sources.push(index === 0 ? 'xStocks issuer catalog' : 'PreStocks issuer catalog');
    } else warnings.push(`${index === 0 ? 'xStocks' : 'PreStocks'} catalog could not be loaded. Retry to discover its assets.`);
  });
  const mints = [...byMint.keys()];
  const base = options.jupiterBaseUrl ?? (options.jupiterApiKey ? 'https://api.jup.ag' : 'https://lite-api.jup.ag');
  if (!/^https:\/\/(api|lite-api)\.jup\.ag$/.test(base)) throw new Error('Unsupported Jupiter API origin');
  const batches: string[][] = [];
  for (let index = 0; index < mints.length; index += 100) batches.push(mints.slice(index,index+100));
  // Bound concurrency to three rather than serializing hundreds of mints or flooding the provider.
  const hydrateBatch = async (batch: string[]): Promise<void> => {
    try {
      const payload = await request(`${base}/tokens/v2/search?query=${batch.join(',')}`, options);
      if (!Array.isArray(payload)) throw new Error('Jupiter token data is unavailable');
      const observedAt = new Date().toISOString();
      for (const item of payload) {
        const token = row(item);
        const asset = byMint.get(string(token.id));
        if (!asset) continue;
        const decimals = number(token.decimals);
        asset.decimals = decimals !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 18 ? decimals : asset.decimals;
        asset.name = string(token.name) || asset.name;
        asset.logoUrl = logo(token.icon) ?? asset.logoUrl;
        const price = positive(token.usdPrice);
        if (price !== null) { asset.priceUsd = price; asset.priceObservedAt = observedAt; }
        const stats = row(token.stats24h);
        asset.change24hPct = number(stats.priceChange);
        const buy = number(stats.buyVolume), sell = number(stats.sellVolume);
        asset.volume24hUsd = buy !== null && sell !== null ? buy + sell : null;
        asset.liquidityUsd = number(token.liquidity);
        asset.marketCapUsd = number(token.mcap) ?? asset.marketCapUsd;
        asset.updatedAt = string(token.updatedAt) || null;
      }
      if (!sources.includes('Jupiter Tokens V2')) sources.push('Jupiter Tokens V2');
    } catch { warnings.push('Some Jupiter prices and token metadata are unavailable. Unpriced assets cannot be traded in paper mode.'); }
  };
  for (let index = 0; index < batches.length; index += 3) await Promise.all(batches.slice(index,index+3).map(hydrateBatch));
  const assets = [...byMint.values()].sort((a,b) => (b.volume24hUsd ?? -1) - (a.volume24hUsd ?? -1) || a.symbol.localeCompare(b.symbol));
  if (assets.some(asset => asset.priceUsd === null)) warnings.push('Some issuer-listed assets do not currently have a market price.');
  if (assets.some(asset => asset.tradingHalted)) warnings.push('Paused, converted, or unverified-status issuer products are listed for reference with trading disabled.');
  return { assets, baskets: resolveMarketBaskets(assets), asOf: new Date().toISOString(), network: 'mainnet-beta', sources, status: assets.length === 0 ? 'unavailable' : warnings.length ? 'partial' : 'live', warnings: [...new Set(warnings)] };
}
