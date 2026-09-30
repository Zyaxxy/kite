import type { MainnetHolding, MainnetPortfolio } from "../trading";

export const PORTFOLIO_CACHE_MAX_AGE_MS = 5 * 60_000;
export const PORTFOLIO_FRESH_MS = 30_000;
const MAX_CACHE_BYTES = 512_000;
const address = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const quantity = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const amount = (value: unknown) =>
  typeof value === "string" && value.length <= 100 && quantity.test(value);
const price = (value: unknown) =>
  value === null ||
  (typeof value === "number" && Number.isFinite(value) && value >= 0);

function validHolding(value: unknown): value is MainnetHolding {
  if (!record(value)) return false;
  return (
    typeof value.mint === "string" &&
    address.test(value.mint) &&
    typeof value.symbol === "string" &&
    value.symbol.length <= 100 &&
    typeof value.name === "string" &&
    value.name.length <= 250 &&
    amount(value.amount) &&
    (value.displayAmount === null || amount(value.displayAmount)) &&
    price(value.priceUsd) &&
    price(value.valueUsd) &&
    (value.valuationUnavailableReason === null ||
      typeof value.valuationUnavailableReason === "string") &&
    (value.spendableAmount === undefined || amount(value.spendableAmount)) &&
    (value.frozenAmount === undefined || amount(value.frozenAmount))
  );
}

export function portfolioCacheKey(wallet: string): string {
  if (!address.test(wallet)) throw new Error("Invalid portfolio wallet.");
  return `kite:portfolio:mainnet-beta:v1:${wallet}`;
}

/** Untrusted browser cache is only a display hint, never a spend authorization. */
export function parseCachedPortfolio(
  raw: string | null,
  wallet: string,
  now = Date.now(),
): MainnetPortfolio | null {
  if (
    !raw ||
    raw.length > MAX_CACHE_BYTES ||
    !address.test(wallet) ||
    !Number.isFinite(now)
  )
    return null;
  try {
    const envelope: unknown = JSON.parse(raw);
    if (
      !record(envelope) ||
      envelope.version !== 1 ||
      !record(envelope.portfolio)
    )
      return null;
    const p = envelope.portfolio;
    if (
      p.walletAddress !== wallet ||
      p.network !== "mainnet-beta" ||
      typeof p.observedAt !== "string"
    )
      return null;
    const observed = Date.parse(p.observedAt);
    if (
      !Number.isFinite(observed) ||
      observed > now ||
      now - observed > PORTFOLIO_CACHE_MAX_AGE_MS
    )
      return null;
    if (
      !amount(p.solBalance) ||
      !amount(p.usdcBalance) ||
      !Array.isArray(p.holdings) ||
      p.holdings.length > 1000 ||
      !p.holdings.every(validHolding)
    )
      return null;
    if (
      typeof p.pricedHoldingsValueUsd !== "number" ||
      !Number.isFinite(p.pricedHoldingsValueUsd) ||
      p.pricedHoldingsValueUsd < 0 ||
      typeof p.hasUnpricedHoldings !== "boolean"
    )
      return null;
    if (
      p.warnings !== undefined &&
      (!Array.isArray(p.warnings) ||
        !p.warnings.every((w) => typeof w === "string"))
    )
      return null;
    if (new Set(p.holdings.map((h) => h.mint)).size !== p.holdings.length)
      return null;
    return p as unknown as MainnetPortfolio;
  } catch {
    return null;
  }
}

export function serializePortfolioCache(
  portfolio: MainnetPortfolio,
  now = Date.now(),
): string | null {
  const encoded = JSON.stringify({ version: 1, portfolio });
  return parseCachedPortfolio(encoded, portfolio.walletAddress, now)
    ? encoded
    : null;
}
