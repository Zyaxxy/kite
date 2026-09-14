import { resolveMarketBaskets } from "./markets";

/** The cluster identity is checked against the RPC, never inferred from its URL. */
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export interface DevnetXStockDefinition {
  underlyingSymbol: string;
  symbol: string;
  name: string;
  decimals: 6;
  logo: string | null;
  issuer: "kite-devnet";
  status: "test";
}

export interface DevnetXStockToken extends DevnetXStockDefinition {
  mint: string;
}

export interface DevnetXStockManifest {
  schemaVersion: 1;
  network: "devnet";
  genesisHash: typeof DEVNET_GENESIS_HASH;
  status: "unprovisioned" | "partial" | "ready";
  description: string;
  mintAuthority?: string;
  updatedAt?: string;
  tokens: DevnetXStockToken[];
  fundingToken: DevnetXStockToken | null;
  intendedCatalog: DevnetXStockDefinition[];
  intendedFundingToken: DevnetXStockDefinition;
}

/** A valueless funding instrument; not Circle USDC or a redeemable dollar token. */
export const DEVNET_FUNDING_TOKEN_DEFINITION: DevnetXStockDefinition = {
  underlyingSymbol: "USD",
  symbol: "KUSD",
  name: "Kite Test USD",
  decimals: 6,
  logo: null,
  issuer: "kite-devnet",
  status: "test",
};

const COMPANIES: ReadonlyArray<readonly [string, string]> = [
  ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "NVIDIA"],
  ["AMZN", "Amazon"], ["GOOGL", "Alphabet"], ["META", "Meta"],
  ["TSLA", "Tesla"], ["ORCL", "Oracle"], ["AMD", "AMD"],
  ["AVGO", "Broadcom"], ["TSM", "TSMC"], ["ASML", "ASML"],
  ["CRM", "Salesforce"], ["NOW", "ServiceNow"], ["MCD", "McDonald's"],
  ["SBUX", "Starbucks"], ["KO", "Coca-Cola"], ["LLY", "Eli Lilly"],
  ["JNJ", "Johnson & Johnson"], ["ABBV", "AbbVie"], ["UNH", "UnitedHealth"],
  ["MRK", "Merck"], ["JPM", "JPMorgan Chase"], ["GS", "Goldman Sachs"],
  ["V", "Visa"], ["MA", "Mastercard"], ["LMT", "Lockheed Martin"],
  ["RTX", "RTX"], ["NOC", "Northrop Grumman"], ["PLTR", "Palantir"],
  ["XOM", "Exxon Mobil"], ["CVX", "Chevron"], ["COP", "ConocoPhillips"],
  ["CAT", "Caterpillar"], ["DE", "Deere"], ["GE", "GE Aerospace"],
  ["HON", "Honeywell"], ["SPY", "S&P 500 ETF"], ["QQQ", "Nasdaq-100 ETF"],
  ["GLD", "Gold ETF"],
];

/** Intended test instruments, not claims that the mints have been provisioned. */
export const DEVNET_XSTOCK_CATALOG: readonly DevnetXStockDefinition[] = COMPANIES.map(
  ([underlyingSymbol, company]) => ({
    underlyingSymbol,
    symbol: `x${underlyingSymbol}`,
    name: `Kite Devnet ${company}`,
    decimals: 6,
    logo: `/company-logos/${underlyingSymbol.toLowerCase()}.webp`,
    issuer: "kite-devnet",
    status: "test",
  }),
);

/** Reuse the canonical basket definitions; private PreStocks have no test substitute. */
export const DEVNET_RECURRING_BASKETS = resolveMarketBaskets([])
  .filter((basket) => basket.category !== "private")
  .map((basket) => ({
    id: basket.id,
    name: basket.name,
    ticker: basket.ticker,
    underlyingSymbols: basket.missingSymbols,
  }));

export function createUnprovisionedDevnetManifest(): DevnetXStockManifest {
  return {
    schemaVersion: 1,
    network: "devnet",
    genesisHash: DEVNET_GENESIS_HASH,
    status: "unprovisioned",
    description: "Valueless Kite test instruments for devnet recurring integration tests. No tokens are available until their mint accounts have been provisioned and verified on devnet. These are not issuer-backed xStocks.",
    tokens: [],
    fundingToken: null,
    intendedCatalog: DEVNET_XSTOCK_CATALOG.map((token) => ({ ...token })),
    intendedFundingToken: { ...DEVNET_FUNDING_TOKEN_DEFINITION },
  };
}

/** Structural validation only. Servers must also verify each mint account on devnet. */
export function validateDevnetXStockManifest(value: unknown): DevnetXStockManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid devnet token manifest.");
  const manifest = value as Partial<DevnetXStockManifest>;
  if (manifest.schemaVersion !== 1 || manifest.network !== "devnet" || manifest.genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error("Token manifest must identify the Solana devnet cluster.");
  }
  if (!Array.isArray(manifest.tokens) || !Array.isArray(manifest.intendedCatalog) || typeof manifest.description !== "string" || manifest.fundingToken === undefined) {
    throw new Error("Invalid devnet token manifest catalog.");
  }
  if (!["unprovisioned", "partial", "ready"].includes(manifest.status ?? "")) {
    throw new Error("Invalid devnet token provisioning status.");
  }
  if (manifest.fundingToken !== null && typeof manifest.fundingToken !== "object") throw new Error("Invalid devnet funding token.");
  const seenSymbols = new Set<string>();
  const seenMints = new Set<string>();
  for (const token of [...manifest.tokens, ...(manifest.fundingToken ? [manifest.fundingToken] : [])]) {
    if (!token || typeof token !== "object") throw new Error("Invalid devnet token entry.");
    const definition = token === manifest.fundingToken ? DEVNET_FUNDING_TOKEN_DEFINITION : DEVNET_XSTOCK_CATALOG.find((item) => item.underlyingSymbol === token.underlyingSymbol);
    if (!definition || token.underlyingSymbol !== definition.underlyingSymbol || token.symbol !== definition.symbol || token.name !== definition.name || token.logo !== definition.logo || token.decimals !== definition.decimals || token.issuer !== "kite-devnet" || token.status !== "test") {
      throw new Error("Devnet token entry does not match the intended test catalog.");
    }
    if (typeof token.mint !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.mint)) {
      throw new Error(`Invalid mint address for ${definition.symbol}.`);
    }
    if (seenSymbols.has(token.underlyingSymbol) || seenMints.has(token.mint)) throw new Error("Duplicate devnet token or mint.");
    seenSymbols.add(token.underlyingSymbol);
    seenMints.add(token.mint);
  }
  const expectedStatus = manifest.tokens.length === 0 && !manifest.fundingToken ? "unprovisioned" : manifest.tokens.length === DEVNET_XSTOCK_CATALOG.length && manifest.fundingToken ? "ready" : "partial";
  if (manifest.status !== expectedStatus) throw new Error("Devnet provisioning status does not match the recorded mints.");
  return manifest as DevnetXStockManifest;
}

export function resolveDevnetBasketAssets(
  manifest: DevnetXStockManifest,
  basketId: string,
): Array<{ token: DevnetXStockToken; weightBps: number }> {
  validateDevnetXStockManifest(manifest);
  const basket = DEVNET_RECURRING_BASKETS.find((item) => item.id === basketId);
  if (!basket) throw new Error("Only public xStocks baskets are supported on devnet.");
  const missing = basket.underlyingSymbols.filter((symbol) => !manifest.tokens.some((token) => token.underlyingSymbol === symbol));
  if (missing.length) throw new Error(`Devnet basket is not provisioned: ${missing.join(", ")}.`);
  const count = basket.underlyingSymbols.length;
  return basket.underlyingSymbols.map((symbol, index) => ({
    token: manifest.tokens.find((item) => item.underlyingSymbol === symbol)!,
    weightBps: Math.floor(10_000 / count) + (index < 10_000 % count ? 1 : 0),
  }));
}
