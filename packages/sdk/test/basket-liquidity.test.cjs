const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assessBasketRoundTrip,
  BASKET_QUOTE_REVIEW_POLICY,
} = require("../dist/basket/liquidity");
const {
  resolveMarketBaskets,
  resolveReviewedMarketBaskets,
} = require("../dist/markets");

test("roundtrip review uses exact raw units at the permitted loss boundary", () => {
  assert.equal(BASKET_QUOTE_REVIEW_POLICY.maxRoundTripLossBps, 200);
  assert.equal(assessBasketRoundTrip("1000000", "980000").passes, true);
  assert.equal(assessBasketRoundTrip("1000000", "979999").passes, false);
  assert.ok(assessBasketRoundTrip("1000000", "979999").lossBps > 200);
  assert.equal(assessBasketRoundTrip("1000000", "1000100").passes, true);
});

test("missing, malformed, zero and out-of-u64 quote output fail closed", () => {
  for (const output of [null, "", "0", "-1", "1.1", "18446744073709551616"]) {
    assert.equal(assessBasketRoundTrip("1000000", output).passes, false);
  }
  assert.equal(assessBasketRoundTrip("not-a-number", "1000").passes, false);
  assert.equal(assessBasketRoundTrip("100", "100", -1).passes, false);
});

test("published mainnet baskets use reviewed definitions without mutating canonical devnet allocations", () => {
  const symbols = [
    "AAPL",
    "MSFT",
    "NVDA",
    "GOOGL",
    "AMZN",
    "KO",
    "SPY",
    "QQQ",
    "GLD",
  ];
  const assets = symbols.map((underlyingSymbol) => ({
    mint: underlyingSymbol,
    underlyingSymbol,
    issuer: "xstocks",
    priceUsd: 10,
    tradingHalted: false,
  }));
  const reviewed = resolveReviewedMarketBaskets(assets);
  assert.deepEqual(
    reviewed.map((b) => b.id),
    [
      "sol-digital-leaders",
      "sol-ai-focused",
      "sol-everyday-focused",
      "sol-core",
    ],
  );
  assert.equal(
    reviewed.some((b) => b.id === "sol-mag7"),
    false,
    "retired seven-leg basket cannot enter mainnet orders",
  );
  for (const basket of reviewed) {
    assert.equal(basket.assets.length, 3);
    assert.equal(
      basket.assets.reduce((sum, leg) => sum + leg.weight, 0),
      10000,
    );
    assert.equal(basket.available, true);
  }
  const canonical = resolveMarketBaskets([]);
  assert.equal(canonical.length, 12);
  assert.deepEqual(canonical.find((b) => b.id === "sol-mag7").missingSymbols, [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "META",
    "TSLA",
  ]);
  assets[0].issuer = "backpack";
  const missing = resolveReviewedMarketBaskets(assets)[0];
  assert.equal(missing.available, false);
  assert.deepEqual(missing.missingSymbols, ["AAPL"]);
  assert.ok(missing.assets.reduce((sum, leg) => sum + leg.weight, 0) < 10000);
});
