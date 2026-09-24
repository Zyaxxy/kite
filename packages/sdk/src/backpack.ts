import { PublicKey } from "@solana/web3.js";

export const BACKPACK_SECURITIES_URL =
  "https://api.backpack.exchange/api/v1/securities";
export const BACKPACK_ASSETS_URL =
  "https://api.backpack.exchange/api/v1/assets";
export const BACKPACK_MARKETS_URL =
  "https://api.backpack.exchange/api/v1/markets";

export interface BackpackSecuritySession {
  name: string;
  minQuantity: string;
  maxQuantity: string;
  stepSize: string;
}

/** An exchange listing is not a Solana mint. Never pass id to a token API. */
export interface BackpackSecurity {
  id: string;
  issuer: "backpack";
  symbol: string;
  underlyingSymbol: string;
  name: string;
  cusip: string | null;
  sessions: BackpackSecuritySession[];
  sourceUrl: string;
  solanaMint: string | null;
  /** Keep all official candidates blocked when a mapping is ambiguous. */
  candidateSolanaMints: string[];
  decimals: number | null;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  /** Observed exchange spot markets only; excludes stock perpetuals. */
  spotMarkets: Array<{ symbol: string; state: string }>;
  /** false only means eligible for Kite's onchain validation, not a route guarantee. */
  discoveryOnly: boolean;
}

export interface BackpackCatalog {
  securities: BackpackSecurity[];
  mappingsAvailable: boolean;
  warnings: string[];
  observedAt: string;
}

type Row = Record<string, unknown>;
const row = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const str = (value: unknown): string =>
  typeof value === "string" ? value : "";
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const decimal = (value: unknown): string =>
  typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? value : "";

function validAssetMappings(payload: unknown): payload is unknown[] {
  return (
    Array.isArray(payload) &&
    payload.every((item) => {
      const asset = row(item);
      return (
        Boolean(str(asset.symbol)) &&
        Array.isArray(asset.tokens) &&
        asset.tokens.every((item) => {
          const token = row(item);
          return (
            Boolean(str(token.blockchain)) &&
            (token.contractAddress === null ||
              typeof token.contractAddress === "string") &&
            typeof token.depositEnabled === "boolean" &&
            typeof token.withdrawEnabled === "boolean" &&
            (token.nativeDecimals === null ||
              (typeof token.nativeDecimals === "number" &&
                Number.isInteger(token.nativeDecimals) &&
                token.nativeDecimals >= 0 &&
                token.nativeDecimals <= 255))
          );
        })
      );
    })
  );
}

function solanaMint(value: unknown): string | null {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))
    return null;
  try {
    return new PublicKey(value).toBase58() === value ? value : null;
  } catch {
    return null;
  }
}

/** Join only official asset symbols. Conflicting mappings fail closed. */
export function parseBackpackSecurities(
  securitiesPayload: unknown,
  assetsPayload: unknown = [],
  marketsPayload: unknown = [],
): BackpackSecurity[] {
  if (!Array.isArray(securitiesPayload))
    throw new Error("Backpack securities catalog is unavailable.");
  const mappings = new Map<string, Row[]>();
  for (const value of list(assetsPayload).map(row)) {
    const candidates = list(value.tokens)
      .map(row)
      .filter(
        (token) =>
          token.blockchain === "Solana" && solanaMint(token.contractAddress),
      );
    const symbol = str(value.symbol);
    if (symbol)
      mappings.set(symbol, [...(mappings.get(symbol) ?? []), ...candidates]);
  }
  const securities = new Map<string, BackpackSecurity>();
  for (const value of securitiesPayload.map(row)) {
    const symbol = str(value.asset);
    const name = str(value.name);
    if (
      !/^[A-Z0-9][A-Z0-9.\-]{0,24}\.US$/.test(symbol) ||
      !name ||
      !Array.isArray(value.sessions)
    )
      throw new Error(
        "Backpack securities catalog contains an invalid listing.",
      );
    if (securities.has(symbol))
      throw new Error(
        "Backpack securities catalog contains a duplicate listing.",
      );
    const candidates = mappings.get(symbol) ?? [];
    const mints = new Set(
      candidates.map((token) => solanaMint(token.contractAddress)),
    );
    const token = mints.size === 1 ? candidates[0] : undefined;
    const mint = token ? solanaMint(token.contractAddress) : null;
    const decimals =
      token &&
      Number.isInteger(token.nativeDecimals) &&
      Number(token.nativeDecimals) >= 0 &&
      Number(token.nativeDecimals) <= 18
        ? Number(token.nativeDecimals)
        : null;
    // All copies must agree on enabled transfers and precision before eligibility.
    const depositEnabled = Boolean(
      token &&
      candidates.every(
        (item) =>
          item.depositEnabled === true && item.nativeDecimals === decimals,
      ),
    );
    const withdrawEnabled = Boolean(
      token &&
      candidates.every(
        (item) =>
          item.withdrawEnabled === true && item.nativeDecimals === decimals,
      ),
    );
    securities.set(symbol, {
      id: `backpack:${symbol}`,
      issuer: "backpack",
      symbol,
      underlyingSymbol: symbol.replace(/\.US$/, ""),
      name,
      cusip: /^[A-Z0-9]{9}$/.test(str(value.cusip)) ? str(value.cusip) : null,
      sessions: value.sessions.map(row).flatMap((session) => {
        const name = str(session.name),
          minQuantity = decimal(session.minQuantity),
          maxQuantity = decimal(session.maxQuantity),
          stepSize = decimal(session.stepSize);
        return name && minQuantity && maxQuantity && stepSize
          ? [{ name, minQuantity, maxQuantity, stepSize }]
          : [];
      }),
      sourceUrl: BACKPACK_SECURITIES_URL,
      solanaMint: mint,
      candidateSolanaMints: [...mints].filter(
        (value): value is string => value !== null,
      ),
      decimals,
      depositEnabled,
      withdrawEnabled,
      spotMarkets: list(marketsPayload)
        .map(row)
        .filter(
          (market) =>
            market.baseSymbol === symbol &&
            market.rwaMarketType === "STOCK" &&
            market.marketType === "SPOT" &&
            market.visible === true,
        )
        .map((market) => ({
          symbol: str(market.symbol),
          state: str(market.orderBookState),
        }))
        .filter((market) => market.symbol && market.state),
      discoveryOnly:
        !mint || decimals === null || !depositEnabled || !withdrawEnabled,
    });
  }
  if (securitiesPayload.length && !securities.size)
    throw new Error(
      "Backpack securities catalog schema could not be verified.",
    );
  return [...securities.values()].sort((a, b) =>
    a.symbol.localeCompare(b.symbol),
  );
}

let cache: { value: BackpackCatalog; expiresAt: number } | null = null;
let pending: Promise<BackpackCatalog> | null = null;

export async function getBackpackCatalog(
  options: { fetcher?: typeof fetch; signal?: AbortSignal } = {},
): Promise<BackpackCatalog> {
  if (!options.fetcher && cache && cache.expiresAt > Date.now())
    return cache.value;
  if (!options.fetcher && pending) return pending;
  const operation = (async () => {
    const results = await Promise.allSettled(
      [BACKPACK_SECURITIES_URL, BACKPACK_ASSETS_URL, BACKPACK_MARKETS_URL].map(
        async (url) => {
          const timeout = AbortSignal.timeout(8_000);
          const response = await (options.fetcher ?? fetch)(url, {
            headers: { Accept: "application/json" },
            signal: options.signal
              ? AbortSignal.any([options.signal, timeout])
              : timeout,
            cache: "no-store",
          });
          if (!response.ok)
            throw new Error(`Backpack returned HTTP ${response.status}.`);
          const payload: unknown = await response.json();
          if (!Array.isArray(payload))
            throw new Error("Backpack response schema is unavailable.");
          if (url === BACKPACK_ASSETS_URL && !validAssetMappings(payload))
            throw new Error("Backpack asset mappings schema is unavailable.");
          return payload;
        },
      ),
    );
    if (results[0].status === "rejected")
      throw new Error("Backpack securities catalog could not be loaded.");
    const warnings: string[] = [];
    if (results[1].status === "rejected")
      warnings.push(
        "Backpack Solana mappings could not be verified. Its securities remain discovery-only.",
      );
    if (results[2].status === "rejected")
      warnings.push(
        "Backpack exchange session availability could not be verified.",
      );
    const value: BackpackCatalog = {
      securities: parseBackpackSecurities(
        results[0].value,
        results[1].status === "fulfilled" ? results[1].value : [],
        results[2].status === "fulfilled" ? results[2].value : [],
      ),
      warnings,
      mappingsAvailable: results[1].status === "fulfilled",
      observedAt: new Date().toISOString(),
    };
    if (!options.fetcher)
      cache = {
        value,
        expiresAt: Date.now() + (warnings.length ? 30_000 : 10 * 60_000),
      };
    return value;
  })();
  if (!options.fetcher) pending = operation;
  try {
    return await operation;
  } finally {
    if (!options.fetcher) pending = null;
  }
}
