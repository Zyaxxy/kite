const test = require("node:test");
const assert = require("node:assert/strict");
const {
  aggregateTokenBalances,
  maxSwapAmount,
  holdingToSwapToken,
  MAINNET_SOL_MINT,
} = require("../dist/trading.js");
const owner = "11111111111111111111111111111111";
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const token2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
function account({
  tokenMint = mint,
  amount = "123456789",
  decimals = 6,
  uiAmountString = "123.456789",
  state = "initialized",
  program = tokenProgram,
  accountOwner = owner,
} = {}) {
  return {
    account: {
      owner: program,
      data: {
        parsed: {
          type: "account",
          info: {
            mint: tokenMint,
            owner: accountOwner,
            state,
            tokenAmount: { amount, decimals, uiAmountString },
          },
        },
      },
    },
  };
}
test("all account balances combine precisely and frozen funds stay visible but unspendable", () => {
  const result = aggregateTokenBalances(
    [
      account({
        amount: "9007199254740993",
        uiAmountString: "9007199254.740993",
      }),
      account({ amount: "7", uiAmountString: "0.000007" }),
      account({ amount: "1000000", uiAmountString: "1", state: "frozen" }),
      account({
        tokenMint: MAINNET_SOL_MINT,
        amount: "1000",
        decimals: 9,
        uiAmountString: "0.000001",
        program: token2022,
      }),
    ],
    owner,
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].rawAmount, "9007199255741000");
  assert.equal(result[0].spendableRawAmount, "9007199254741000");
  assert.equal(result[0].displayAmount, "9007199255.741");
  assert.equal(result[1].tokenProgram, token2022);
});
test("scaled token displays remain separate from raw amounts and missing displays stay unknown", () => {
  const scaled = aggregateTokenBalances(
    [account({ amount: "1000000", uiAmountString: "1.75" })],
    owner,
  )[0];
  assert.equal(scaled.rawAmount, "1000000");
  assert.equal(scaled.displayAmount, "1.75");
  assert.equal(
    aggregateTokenBalances([account({ uiAmountString: null })], owner)[0]
      .displayAmount,
    null,
  );
  assert.equal(
    aggregateTokenBalances(
      [account({ amount: "0", uiAmountString: "0" })],
      owner,
    ).length,
    0,
  );
});
test("malformed, foreign-owned and contradictory account data fail closed", () => {
  for (const row of [
    account({ amount: "-1" }),
    account({ amount: "1e6" }),
    account({ amount: "18446744073709551616" }),
    account({ decimals: 256 }),
    account({ accountOwner: mint }),
    account({ state: "uninitialized" }),
    account({ program: owner }),
    {},
  ])
    assert.throws(() => aggregateTokenBalances([row], owner), /RPC/);
  assert.throws(
    () => aggregateTokenBalances([account(), account({ decimals: 8 })], owner),
    /inconsistent/,
  );
  assert.throws(
    () =>
      aggregateTokenBalances(
        [account(), account({ program: token2022 })],
        owner,
      ),
    /inconsistent/,
  );
});
test("tokens beyond swap precision remain visible without offering an unsafe amount", () => {
  const balance = aggregateTokenBalances(
    [
      account({
        amount: "1",
        decimals: 19,
        uiAmountString: "0.0000000000000000001",
      }),
    ],
    owner,
  )[0];
  assert.equal(balance.rawAmount, "1");
  assert.equal(balance.decimals, 19);
  assert.equal(
    maxSwapAmount({
      mint,
      decimals: 19,
      spendableAmount: "0.0000000000000000001",
    }),
    "0",
  );
});
test("Max reserves SOL without rounding and never spends frozen or unverified balance units", () => {
  assert.equal(
    maxSwapAmount({
      mint: MAINNET_SOL_MINT,
      decimals: 9,
      spendableAmount: "1.123456789",
    }),
    "1.113456789",
  );
  assert.equal(
    maxSwapAmount({
      mint: MAINNET_SOL_MINT,
      decimals: 9,
      spendableAmount: "0.005",
    }),
    "0",
  );
  assert.equal(
    maxSwapAmount({ mint, decimals: 6, spendableAmount: "9007199254.740993" }),
    "9007199254.740993",
  );
  assert.equal(maxSwapAmount({ mint, amount: "100", decimals: 6 }), "0");
  assert.equal(
    maxSwapAmount({
      mint,
      decimals: 6,
      spendableAmount: "100",
      tradingHalted: true,
    }),
    "0",
  );
});
test("wallet identity metadata does not imply verification or invent prices", () => {
  const token = holdingToSwapToken({
    mint,
    symbol: "UNKNOWN",
    name: "Unidentified wallet token",
    priceUsd: null,
  });
  assert.equal(token.verified, false);
  assert.equal(token.source, "wallet");
  assert.equal(token.decimals, null);
  assert.equal(token.priceUsd, null);
});
