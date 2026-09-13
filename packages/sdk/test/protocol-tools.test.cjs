const test = require("node:test");
const assert = require("node:assert/strict");
const {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} = require("@solana/web3.js");
const {
  allocateBasketInput,
  buildAtomicBasketTransaction,
  AtomicBasketCapacityError,
} = require("../dist/basket/atomic-swap");
const { simulateTradeOrder } = require("../dist/simulation");
const {
  calculateBasketRebalance,
  calculateTimeWeightedReturn,
} = require("../dist/rebalance");
const { subscribePythPriceFeeds } = require("../dist/pyth-streaming");
const key = () => Keypair.generate().publicKey;

test("basket allocations conserve every unit with deterministic remainders", () => {
  const targets = [
    { mint: "a", weightBps: 3333 },
    { mint: "b", weightBps: 3333 },
    { mint: "c", weightBps: 3334 },
  ];
  for (let amount = 3n; amount <= 1000n; amount++) {
    const allocated = allocateBasketInput(amount, targets);
    assert.equal(
      allocated.reduce((sum, leg) => sum + leg.amount, 0n),
      amount,
    );
    assert.ok(allocated.every((leg) => leg.amount > 0n));
  }
  assert.deepEqual(
    allocateBasketInput(10n, targets).map((x) => x.amount),
    [3n, 3n, 4n],
  );
  assert.throws(() => allocateBasketInput(2n, targets), /too small/);
  assert.throws(
    () =>
      allocateBasketInput(10n, [
        { mint: "a", weightBps: 5000 },
        { mint: "a", weightBps: 5000 },
      ]),
    /unique/,
  );
});
test("atomic builder uses one v0 transaction and fails before partial construction", () => {
  const payer = key();
  const params = {
    payer,
    recentBlockhash: key().toBase58(),
    computeUnitLimit: 200000,
    legs: [
      [
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: key(),
          lamports: 1,
        }),
      ],
    ],
  };
  const built = buildAtomicBasketTransaction(params);
  assert.equal(built.version, 0);
  assert.ok(built.serializedBytes <= 1232);
  assert.equal(built.transaction.message.compiledInstructions.length, 3);
  assert.throws(
    () =>
      buildAtomicBasketTransaction({
        ...params,
        legs: [[ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 })]],
      }),
    /one explicit/,
  );
  assert.throws(
    () =>
      buildAtomicBasketTransaction({
        ...params,
        legs: [
          [
            new TransactionInstruction({
              programId: key(),
              keys: [],
              data: Buffer.alloc(1300),
            }),
          ],
        ],
      }),
    AtomicBasketCapacityError,
  );
  assert.throws(
    () =>
      buildAtomicBasketTransaction({
        ...params,
        legs: [
          [
            SystemProgram.transfer({
              fromPubkey: key(),
              toPubkey: key(),
              lamports: 1,
            }),
          ],
        ],
      }),
    /additional signer/,
  );
});
test("rebalance keeps cash and asset value conserved without token float rounding", () => {
  const result = calculateBasketRebalance({
    targets: [
      { mint: "a", weightBps: 6000 },
      { mint: "b", weightBps: 4000 },
    ],
    holdings: [
      { mint: "a", valueUsdMicros: 80n },
      { mint: "b", valueUsdMicros: 10n },
    ],
    cashUsdMicros: 10n,
  });
  assert.deepEqual(
    result.legs.map((x) => x.deltaValueUsdMicros),
    [-20n, 30n],
  );
  assert.deepEqual(
    result.legs.map((x) => x.action),
    ["sell", "buy"],
  );
  assert.equal(
    result.legs.reduce((sum, x) => sum + x.deltaValueUsdMicros, 0n),
    10n,
  );
  assert.throws(
    () =>
      calculateBasketRebalance({
        targets: [{ mint: "a", weightBps: 10000 }],
        holdings: [{ mint: "unrelated", valueUsdMicros: 1n }],
      }),
    /explicitly/,
  );
  const unfunded = calculateBasketRebalance({
    targets: [
      { mint: "a", weightBps: 5000 },
      { mint: "b", weightBps: 5000 },
    ],
    holdings: [
      { mint: "a", valueUsdMicros: 51n },
      { mint: "b", valueUsdMicros: 40n },
    ],
    cashUsdMicros: 9n,
    thresholdBps: 200,
  });
  assert.equal(unfunded.fullyFunded, false);
  assert.equal(unfunded.projectedCashUsdMicros, -1n);
  assert.equal(calculateTimeWeightedReturn([]), null);
  assert.ok(
    Math.abs(
      calculateTimeWeightedReturn([
        { openingValue: 100, closingValue: 110 },
        { openingValue: 200, closingValue: 220 },
      ]) - 0.21,
    ) < 1e-10,
  );
});
function order() {
  const payer = key();
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: key().toBase58(),
      instructions: [
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: key(),
          lamports: 1,
        }),
      ],
    }).compileToV0Message(),
  );
  return {
    payer,
    value: {
      taker: payer.toBase58(),
      transaction: Buffer.from(tx.serialize()).toString("base64"),
    },
  };
}
test("simulation preserves sponsored blockhash and distinguishes failure from unavailability", async () => {
  const { payer, value } = order();
  let config;
  const connection = {
    simulateTransaction: async (tx, options) => {
      config = options;
      return { value: { err: null, unitsConsumed: 321 } };
    },
  };
  const result = await simulateTradeOrder(connection, value, payer);
  assert.equal(result.status, "passed");
  assert.equal(result.unitsConsumed, 321);
  assert.equal(config.sigVerify, false);
  assert.equal(config.replaceRecentBlockhash, false);
  assert.equal(
    (
      await simulateTradeOrder(
        {
          simulateTransaction: async () => ({
            value: { err: { InstructionError: [0, "Custom"] } },
          }),
        },
        value,
        payer,
      )
    ).status,
    "failed",
  );
  assert.equal(
    (
      await simulateTradeOrder(
        {
          simulateTransaction: async () => {
            throw new Error("offline");
          },
        },
        value,
        payer,
      )
    ).status,
    "unavailable",
  );
  assert.equal(
    (
      await simulateTradeOrder(
        { simulateTransaction: async () => new Promise(() => {}) },
        value,
        payer,
        { timeoutMs: 5 },
      )
    ).status,
    "unavailable",
  );
  assert.equal(
    (await simulateTradeOrder(connection, value, key())).status,
    "unavailable",
  );
  assert.doesNotMatch(
    (
      await simulateTradeOrder(
        {
          simulateTransaction: async () => {
            throw new Error("https://rpc.test?api-key=private-value");
          },
        },
        value,
        payer,
      )
    ).error,
    /private-value/,
  );
  assert.equal(
    (
      await simulateTradeOrder(
        { simulateTransaction: async () => ({ value: {} }) },
        value,
        payer,
      )
    ).status,
    "unavailable",
  );
});
test("Pyth stream accepts only requested fresh ordered confidence-bounded real ticks", () => {
  const id = "a".repeat(64);
  const other = "b".repeat(64);
  let source;
  let url;
  const ticks = [];
  const stop = subscribePythPriceFeeds(
    [id],
    (p) => ticks.push(p),
    () => {},
    {
      now: () => 1000000,
      createEventSource: (u) => {
        url = u;
        source = {
          onmessage: null,
          onerror: null,
          close() {
            this.closed = true;
          },
        };
        return source;
      },
    },
  );
  const send = (publish_time, conf = "1", feed = id) =>
    source.onmessage({
      data: JSON.stringify({
        parsed: [
          { id: feed, price: { price: "1000", conf, expo: -2, publish_time } },
        ],
      }),
    });
  send(999);
  send(998);
  send(900);
  send(1000, "500");
  send(1000, "1", other);
  send(1011);
  send(1000);
  assert.equal(ticks.length, 2);
  assert.equal(ticks[0].price, 10);
  assert.equal(ticks[0].status, "unknown");
  assert.ok(
    url.startsWith("https://hermes.pyth.network/v2/updates/price/stream?"),
  );
  stop();
  assert.equal(source.onmessage, null);
  assert.equal(source.closed, true);
  assert.throws(() => subscribePythPriceFeeds(["invalid"], () => {}));
  assert.throws(() =>
    subscribePythPriceFeeds([id], () => {}, undefined, {
      endpoint: "http://example.com",
    }),
  );
});
