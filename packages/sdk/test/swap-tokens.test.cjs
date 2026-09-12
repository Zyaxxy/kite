const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseJupiterSwapTokens,
  MAINNET_SOL_MINT,
} = require("../dist/trading.js");

test("token discovery preserves unknown prices and real verification flags", () => {
  const payload = [
    {
      id: MAINNET_SOL_MINT,
      symbol: "SOL",
      name: "Solana",
      decimals: 9,
      isVerified: true,
      usdPrice: 101.23,
    },
  ];
  const [verified] = parseJupiterSwapTokens(payload);
  assert.equal(verified.verified, true);
  assert.equal(verified.priceUsd, 101.23);
  const [unverified] = parseJupiterSwapTokens([
    { ...payload[0], isVerified: "true", usdPrice: null },
  ]);
  assert.equal(unverified.verified, false);
  assert.equal(unverified.priceUsd, null);
  assert.equal(unverified.source, "jupiter");
});

test("token discovery rejects malformed identities and unsupported decimal metadata", () => {
  const valid = {
    id: MAINNET_SOL_MINT,
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
  };
  const malformed = [
    null,
    { ...valid, id: "invalid" },
    { ...valid, name: "" },
    { ...valid, symbol: "" },
    { ...valid, decimals: 19 },
    { ...valid, decimals: 1.5 },
  ];
  assert.deepEqual(parseJupiterSwapTokens(malformed), []);
  assert.deepEqual(parseJupiterSwapTokens({ error: "unavailable" }), []);
});
