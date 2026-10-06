import test from "node:test";
import assert from "node:assert/strict";
import { calculateCreatorPoints } from "../src/creator";
import { calculateMarketCapWeights } from "../src/basket/custom";
import type { MarketAsset } from "../src/markets";

test("creator points preserve exact units and reward active subscribers independently", () => {
  assert.equal(calculateCreatorPoints("99999999", 0), "0");
  assert.equal(calculateCreatorPoints("100000000", 2), "201");
  assert.equal(
    calculateCreatorPoints("12345678901234567890", 0),
    "123456789012",
  );
  assert.throws(() => calculateCreatorPoints("-1", 0));
  assert.throws(() => calculateCreatorPoints("1", 1.5));
});
test("market-cap weights require observed caps and conserve all basis points", () => {
  const selected = [
    { mint: "first", symbol: "A" },
    { mint: "second", symbol: "B" },
    { mint: "third", symbol: "C" },
  ];
  const catalog = selected.map((asset) => ({
    ...asset,
    underlyingMarketCapUsd: 1,
  })) as MarketAsset[];
  assert.deepEqual(
    calculateMarketCapWeights(selected, catalog).map((a) => a.weightBps),
    [3334, 3333, 3333],
  );
  assert.throws(() => calculateMarketCapWeights(selected, []), /unavailable/);
});
