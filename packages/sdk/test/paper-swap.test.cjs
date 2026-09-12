const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPaperAccount,
  executePaperOrder,
  quotePaperSwap,
  executePaperSwap,
  parsePaperAccount,
  valuePaperAccount,
} = require("../dist/paper.js");

const now = "2026-09-13T00:00:00.000Z";
const input = {
  mint: "input-stock",
  symbol: "INPUT",
  priceUsd: 50,
  priceObservedAt: now,
  verified: true,
  tradingHalted: false,
};
const output = {
  mint: "output-stock",
  symbol: "OUTPUT",
  priceUsd: 25,
  priceObservedAt: now,
  verified: true,
  tradingHalted: false,
};

test("paper stock swap conserves equity and cash while realizing the input cost basis", () => {
  const account = executePaperOrder(
    createPaperAccount(1000),
    input,
    "buy",
    1000,
    now,
  );
  const original = JSON.stringify(account);
  const appreciated = { ...input, priceUsd: 75 };
  const quote = quotePaperSwap(account, appreciated, output, 5, now);
  assert.equal(quote.valueUsd, 375);
  assert.equal(quote.outputQuantity, 15);
  const swapped = executePaperSwap(account, appreciated, output, 5, now);
  assert.equal(swapped.cashUsd, account.cashUsd);
  assert.equal(
    swapped.positions.find((p) => p.mint === input.mint).quantity,
    15,
  );
  assert.equal(
    swapped.positions.find((p) => p.mint === input.mint).costBasisUsd,
    750,
  );
  assert.equal(
    swapped.positions.find((p) => p.mint === output.mint).quantity,
    15,
  );
  assert.equal(
    swapped.positions.find((p) => p.mint === output.mint).costBasisUsd,
    375,
  );
  const [buy, sell] = swapped.orders;
  assert.equal(buy.side, "buy");
  assert.equal(sell.side, "sell");
  assert.equal(buy.swapId, sell.swapId);
  assert.notEqual(buy.id, sell.id);
  assert.equal(buy.totalUsd, sell.totalUsd);
  assert.equal(sell.realizedPnlUsd, 125);
  assert.equal(
    valuePaperAccount(swapped, [appreciated, output]).profitLossUsd,
    500,
  );
  assert.equal(
    valuePaperAccount(swapped, [appreciated, output]).totalUsd,
    valuePaperAccount(account, [appreciated, output]).totalUsd,
  );
  assert.equal(JSON.stringify(account), original);
  assert.deepEqual(
    parsePaperAccount(JSON.parse(JSON.stringify(swapped))),
    swapped,
  );
});

test("full paper swap merges into an existing output holding and records realized losses", () => {
  let account = executePaperOrder(
    createPaperAccount(1000),
    input,
    "buy",
    200,
    now,
  );
  account = executePaperOrder(account, output, "buy", 100, now);
  const swapped = executePaperSwap(
    account,
    { ...input, priceUsd: 20 },
    output,
    4,
    now,
  );
  assert.equal(
    swapped.positions.some((p) => p.mint === input.mint),
    false,
  );
  assert.equal(swapped.positions[0].quantity, 7.2);
  assert.equal(swapped.positions[0].costBasisUsd, 180);
  assert.equal(swapped.cashUsd, 700);
  assert.equal(swapped.orders[1].realizedPnlUsd, -120);
  assert.equal(valuePaperAccount(swapped, [input, output]).profitLossUsd, -120);
});

test("invalid or insufficient input quantities cannot modify either side or create cash", () => {
  const account = executePaperOrder(
    createPaperAccount(1000),
    input,
    "buy",
    200,
    now,
  );
  const original = JSON.stringify(account);
  for (const quantity of [0, -1, NaN, Infinity, 5, 4 + 1e-12])
    assert.throws(() =>
      executePaperSwap(account, input, output, quantity, now),
    );
  assert.throws(
    () => executePaperSwap(account, input, input, 1, now),
    /different/,
  );
  assert.throws(
    () => executePaperSwap(createPaperAccount(), input, output, 1, now),
    /holdings/,
  );
  assert.equal(JSON.stringify(account), original);
});

test("a halted, missing, stale or future quote on either side makes the whole swap fail", () => {
  const account = executePaperOrder(
    createPaperAccount(1000),
    input,
    "buy",
    200,
    now,
  );
  const original = JSON.stringify(account);
  for (const invalid of [
    { priceUsd: null },
    { priceUsd: 0 },
    { priceUsd: Infinity },
    { tradingHalted: true },
    { verified: false },
    { priceObservedAt: "2026-09-12T23:57:59.000Z" },
    { priceObservedAt: "2026-09-13T00:00:31.000Z" },
    { priceObservedAt: null },
  ]) {
    assert.throws(() =>
      executePaperSwap(account, { ...input, ...invalid }, output, 1, now),
    );
    assert.throws(() =>
      executePaperSwap(account, input, { ...output, ...invalid }, 1, now),
    );
  }
  assert.equal(JSON.stringify(account), original);
});

test("cash stays bit-for-bit unchanged and small remaining holdings are not discarded", () => {
  const account = {
    ...createPaperAccount(1000),
    cashUsd: 0.1 + 0.2,
    positions: [
      {
        mint: input.mint,
        symbol: input.symbol,
        quantity: 1e-9,
        costBasisUsd: 1e-8,
      },
    ],
  };
  const swapped = executePaperSwap(account, input, output, 9.9e-10, now);
  assert.equal(swapped.cashUsd, account.cashUsd);
  const remaining = swapped.positions.find((p) => p.mint === input.mint);
  assert.ok(remaining.quantity > 0 && remaining.quantity < 1e-10);
  assert.ok(remaining.costBasisUsd > 0);
});

test("corrupt persisted swap identifiers and realized PnL are rejected", () => {
  const bought = executePaperOrder(
    createPaperAccount(),
    input,
    "buy",
    100,
    now,
  );
  const swapped = executePaperSwap(bought, input, output, 1, now);
  assert.equal(
    parsePaperAccount({
      ...swapped,
      orders: [{ ...swapped.orders[0], swapId: "" }],
    }),
    null,
  );
  assert.equal(
    parsePaperAccount({
      ...swapped,
      orders: [{ ...swapped.orders[1], realizedPnlUsd: Infinity }],
    }),
    null,
  );
  assert.equal(
    parsePaperAccount({
      ...swapped,
      orders: [{ ...swapped.orders[1], realizedPnlUsd: "invalid" }],
    }),
    null,
  );
});
