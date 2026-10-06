import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_BASKET_DEFINITIONS,
  resolveAllMarketBaskets,
  resolveCanonicalBasket,
  type MarketAsset,
} from "../src/markets";
import { getBasketLiquidityAudit } from "../src/basket/liquidity-audit";
const definition = CANONICAL_BASKET_DEFINITIONS.find(
  (item) => item.id === "sol-digital-economy",
)!;
const asset = (symbol: string, index: number): MarketAsset => ({
  mint: `test-only-${index}`,
  symbol: `${symbol}x`,
  underlyingSymbol: symbol,
  name: symbol,
  issuer: "xstocks",
  kind: "equity",
  verified: true,
  tradingHalted: false,
  priceUsd: 10,
  change24hPct: null,
  decimals: 8,
  logoUrl: null,
  volume24hUsd: null,
  liquidityUsd: null,
  marketCapUsd: null,
  updatedAt: null,
  priceObservedAt: null,
  sourceUrl: "https://api.xstocks.fi",
});
test("expanded allocation keeps exact weights without inventing liquidity or prices", () => {
  const assets = definition.symbols.map(asset);
  const basket = resolveAllMarketBaskets(assets).find(
    (item) => item.id === definition.id,
  )!;
  assert.equal(basket.assets.length, 12);
  assert.equal(
    basket.assets.reduce((sum, item) => sum + item.weight, 0),
    10000,
  );
  assert.equal(basket.available, true);
  assert.equal(basket.liquidityAudit, undefined);
  for (const patch of [
    { verified: false },
    { tradingHalted: true },
    { priceUsd: null },
  ]) {
    const degraded = assets.map((value, index) =>
      index === 0 ? { ...value, ...patch } : value,
    );
    assert.equal(
      resolveAllMarketBaskets(degraded).find(
        (item) => item.id === definition.id,
      )!.available,
      false,
    );
  }
  assert.equal(
    resolveAllMarketBaskets(assets.slice(1)).find(
      (item) => item.id === definition.id,
    )!.available,
    false,
  );
});
test("research-only canonical symbols never masquerade as verified tradable mints", () => {
  const basket = resolveCanonicalBasket(definition.id)!;
  assert.equal(basket.available, false);
  assert.equal(basket.missingSymbols.length, 12);
  assert.ok(
    basket.assets.every(
      ({ asset }) =>
        !asset.verified && asset.priceUsd === null && asset.decimals === null,
    ),
  );
});

test("an unaudited definition has no invented verification record", () => {
  assert.equal(getBasketLiquidityAudit("sol-digital-economy"), null);
});
