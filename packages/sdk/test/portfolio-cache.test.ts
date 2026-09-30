import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCachedPortfolio,
  portfolioCacheKey,
  serializePortfolioCache,
  PORTFOLIO_CACHE_MAX_AGE_MS,
} from "../src/portfolio/cache";
import type { MainnetPortfolio } from "../src/trading";
const owner = "11111111111111111111111111111111";
const other = "So11111111111111111111111111111111111111112";
const now = Date.parse("2026-09-30T00:00:00.000Z");
const portfolio: MainnetPortfolio = {
  walletAddress: owner,
  network: "mainnet-beta",
  observedAt: new Date(now).toISOString(),
  solBalance: "0",
  usdcBalance: "0",
  holdings: [],
  pricedHoldingsValueUsd: 0,
  hasUnpricedHoldings: false,
};
test("wallet-scoped cache preserves a genuine empty wallet and cannot bleed into another account", () => {
  const raw = serializePortfolioCache(portfolio, now);
  assert.deepEqual(parseCachedPortfolio(raw, owner, now), portfolio);
  assert.equal(parseCachedPortfolio(raw, other, now), null);
  assert.notEqual(portfolioCacheKey(owner), portfolioCacheKey(other));
});
test("cache rejects expired, future, corrupt and wrong-network observations", () => {
  const raw = serializePortfolioCache(portfolio, now);
  assert.equal(
    parseCachedPortfolio(raw, owner, now + PORTFOLIO_CACHE_MAX_AGE_MS + 1),
    null,
  );
  assert.equal(parseCachedPortfolio(raw, owner, now - 1), null);
  assert.equal(parseCachedPortfolio("invalid JSON", owner, now), null);
  assert.equal(
    parseCachedPortfolio(
      JSON.stringify({
        version: 1,
        portfolio: { ...portfolio, network: "devnet" },
      }),
      owner,
      now,
    ),
    null,
  );
  assert.equal(
    parseCachedPortfolio(JSON.stringify({ version: 2, portfolio }), owner, now),
    null,
  );
});
test("malformed holdings and impossible totals never enter display cache", () => {
  const invalid = [
    { ...portfolio, pricedHoldingsValueUsd: -1 },
    { ...portfolio, holdings: [{ mint: other, amount: "-4" }] },
    { ...portfolio, solBalance: "NaN" },
    { ...portfolio, observedAt: "not a date" },
  ];
  for (const value of invalid)
    assert.equal(
      parseCachedPortfolio(
        JSON.stringify({ version: 1, portfolio: value }),
        owner,
        now,
      ),
      null,
    );
});
