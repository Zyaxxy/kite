import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  rmSync,
  statSync,
  chmodSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sdk = require("../../../packages/sdk/dist/index.js");
const web3 = require("@solana/web3.js");
const spl = require("@solana/spl-token");
const {
  testJupiterInstruction,
} = require("../../../packages/sdk/test/fixtures/jupiter.cjs");
const key = () => web3.Keypair.generate().publicKey.toBase58();
const nowSeconds = 1_790_000_000;
const owner = key(),
  buyer = key(),
  fundingMint = key(),
  stockMint = key();
const plan = {
  id: "a".repeat(32),
  owner,
  buyer,
  delegation: key(),
  fundingMint,
  fundingSymbol: "TEST",
  fundingDecimals: 6,
  amountUnits: "1000000",
  target: { type: "stock", id: stockMint },
  allocations: [{ mint: stockMint, symbol: "STOCK", weightBps: 10000 }],
  schedule: {
    unit: "day",
    interval: 1,
    startsAt: nowSeconds - 60,
    occurrences: 2,
  },
  permission: {
    periodSeconds: 86400,
    startsAt: nowSeconds - 60,
    expiresAt: nowSeconds + 86400 + 6 * 3600 - 60,
    maximumCollections: 2,
  },
  slippageBps: 100,
  status: "active",
  createdAt: nowSeconds - 120,
};
const payment = {
  address: plan.delegation,
  owner,
  buyer,
  mint: fundingMint,
  amountPerPeriod: plan.amountUnits,
  periodSeconds: plan.permission.periodSeconds,
  startsAt: plan.permission.startsAt,
  expiresAt: plan.permission.expiresAt,
  pulledInPeriod: "0",
  currentPeriodStartedAt: plan.permission.startsAt,
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const source = spl
  .getAssociatedTokenAddressSync(
    new web3.PublicKey(fundingMint),
    new web3.PublicKey(owner),
  )
  .toBase58();
const staging = spl
  .getAssociatedTokenAddressSync(
    new web3.PublicKey(fundingMint),
    new web3.PublicKey(buyer),
  )
  .toBase58();
const destination = spl
  .getAssociatedTokenAddressSync(
    new web3.PublicKey(stockMint),
    new web3.PublicKey(owner),
  )
  .toBase58();

function loadModule(name, dependencies, extras = {}) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(`../lib/server/${name}.ts`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    Buffer,
    URLSearchParams,
    Error,
    Date,
    console,
    require: (dependency) => {
      if (!(dependency in dependencies))
        throw new Error(`Unexpected dependency ${dependency}`);
      return dependencies[dependency];
    },
    ...extras,
  });
  return exports;
}
function fixedDate(time) {
  return class extends Date {
    static now() {
      return time();
    }
  };
}
function tokenAccount(mint, wallet, amount) {
  const data = Buffer.alloc(165);
  new web3.PublicKey(mint).toBuffer().copy(data, 0);
  new web3.PublicKey(wallet).toBuffer().copy(data, 32);
  data.writeBigUInt64LE(BigInt(amount), 64);
  data[108] = 1;
  return {
    owner: spl.TOKEN_PROGRAM_ID.toBase58(),
    data: [data.toString("base64"), "base64"],
    lamports: 2039280,
    executable: false,
  };
}
function stockRoute() {
  return {
    inputMint: fundingMint,
    outputMint: stockMint,
    inAmount: "1000000",
    outAmount: "1000000",
    otherAmountThreshold: "990000",
    slippageBps: 100,
    swapMode: "ExactIn",
    priceImpactPct: "0.005",
    setupInstructions: [],
    otherInstructions: [],
    cleanupInstruction: null,
    swapInstruction: testJupiterInstruction({
      signer: buyer,
      source: staging,
      destination,
      inputMint: fundingMint,
      outputMint: stockMint,
    }),
  };
}
function builder({
  routeChange = () => {},
  permissionChange = () => {},
  sourceSpent = 1000000,
  stagingAfter = 500000,
  outputAmount = 1000000,
  outputOwner = owner,
  simulationFailure = false,
} = {}) {
  const calls = { quotes: 0, simulations: 0, collects: 0 };
  const currentPayment = clone(payment);
  permissionChange(currentPayment);
  const exports = loadModule(
    "investing-order",
    {
      "@solana/web3.js": web3,
      "@solana/spl-token": spl,
      "@kite/sdk": {
        ...sdk,
        buildCollectRecurringInstructions: async (...args) => {
          calls.collects += 1;
          return sdk.buildCollectRecurringInstructions(...args);
        },
      },
      "./recurring-payments": {
        readDelegation: async () => ({ payment: currentPayment }),
      },
      "./markets": {
        getServerMarketCatalog: async () => ({
          assets: [
            {
              mint: stockMint,
              symbol: "STOCK",
              verified: true,
              tradingHalted: false,
            },
          ],
          baskets: [],
        }),
      },
      "./mint-precision": { getTradeMintDecimals: async () => 6 },
      "./jupiter-build": {
        fetchJupiterBuild: async (params) => {
          calls.quotes += 1;
          assert.equal(params.get("destinationTokenAccount"), destination);
          assert.equal(params.get("taker"), buyer);
          assert.equal(params.get("amount"), "1000000");
          const route = stockRoute();
          routeChange(route);
          return Response.json(route);
        },
      },
      "./composed-transactions": {
        assertMainnetV1Ready: async (versions) =>
          assert.ok(versions.includes(1)),
        latestBlockhash: async () => ({
          blockhash: key(),
          lastValidBlockHeight: 100,
        }),
        authorizeComposed: async (order) => ({
          ...order,
          authorization: "test-authorization",
          requestId: "test-request",
        }),
        mainnetRpc: async (method, params) => {
          assert.equal(
            method,
            "getMultipleAccounts",
            "No broadcast or separate collection RPC is allowed while preparing",
          );
          if (params[0][0] === fundingMint)
            return {
              value: [fundingMint, stockMint].map(() => {
                const data = Buffer.alloc(82);
                data[44] = 6;
                data[45] = 1;
                return {
                  owner: spl.TOKEN_PROGRAM_ID.toBase58(),
                  data: [data.toString("base64"), "base64"],
                  lamports: 1461600,
                  executable: false,
                };
              }),
            };
          assert.equal(
            params[0].join(","),
            [source, staging, destination].join(","),
          );
          return {
            value: [
              tokenAccount(fundingMint, owner, 2000000),
              tokenAccount(fundingMint, buyer, 500000),
              tokenAccount(stockMint, owner, 0),
            ],
          };
        },
        simulateComposed: async (transaction) => {
          calls.simulations += 1;
          const decoded = await sdk.inspectWalletTransaction(transaction);
          assert.equal(decoded.message.version, 1);
          assert.equal(
            Object.keys(decoded.transaction.signatures).join(","),
            buyer,
          );
          if (simulationFailure)
            throw new Error("A swap leg failed simulation");
          return {
            err: null,
            accounts: [
              tokenAccount(fundingMint, owner, 2000000 - sourceSpent),
              tokenAccount(fundingMint, buyer, stagingAfter),
              tokenAccount(stockMint, outputOwner, outputAmount),
            ],
          };
        },
      },
    },
    {
      Date: fixedDate(() => nowSeconds * 1000),
      process: { env: { JUPITER_API_KEY: "test-only-key" } },
    },
  );
  return {
    ...exports,
    calls,
    prepare: () =>
      exports.prepareRecurringInvestmentOrder(clone(plan), `${plan.id}:0`),
  };
}

test("recurring route enforces a 1% impact ceiling using Jupiter's decimal ratio", () => {
  const { validateInvestmentRoute } = builder();
  for (const impact of ["0", "0.005", "0.01", "-0.01"])
    assert.doesNotThrow(() =>
      validateInvestmentRoute(
        { ...stockRoute(), priceImpactPct: impact },
        1000000n,
        stockMint,
        plan,
      ),
    );
  for (const impact of ["0.010001", "-0.010001", "0.5", "1", "NaN", "Infinity"])
    assert.throws(
      () =>
        validateInvestmentRoute(
          { ...stockRoute(), priceImpactPct: impact },
          1000000n,
          stockMint,
          plan,
        ),
      /1% price-impact/,
    );
});

test("a recurring stock order combines collection and delivery in one simulated V1 transaction", async () => {
  const run = builder();
  const result = await run.prepare();
  assert.equal(result.order.transactionVersion, 1);
  assert.equal(result.outputs[0].amountUnits, "990000");
  assert.deepEqual(run.calls, { quotes: 1, simulations: 1, collects: 1 });
});

test("recurring settlement rejects excess owner debit, buyer balance drift and wrong or insufficient delivery", async () => {
  for (const [options, pattern] of [
    [{ sourceSpent: 1000001 }, /authorized allocation/],
    [{ sourceSpent: 999999 }, /authorized allocation/],
    [{ stagingAfter: 499999 }, /authorized allocation/],
    [{ stagingAfter: 500001 }, /authorized allocation/],
    [{ outputOwner: key() }, /expected owner's/],
    [{ outputAmount: 989999 }, /investor's wallet/],
  ])
    await assert.rejects(builder(options).prepare(), pattern);
});

test("changed or spent subscription terms fail before routes and collection instructions are built", async () => {
  for (const permissionChange of [
    (p) => {
      p.owner = key();
    },
    (p) => {
      p.buyer = key();
    },
    (p) => {
      p.mint = key();
    },
    (p) => {
      p.amountPerPeriod = "1000001";
    },
    (p) => {
      p.periodSeconds += 1;
    },
    (p) => {
      p.expiresAt += 1;
    },
    (p) => {
      p.pulledInPeriod = "1";
    },
  ]) {
    const run = builder({ permissionChange });
    await assert.rejects(run.prepare(), /permission|allowance/);
    assert.deepEqual(run.calls, { quotes: 0, simulations: 0, collects: 0 });
  }
});

test("a recurring route cannot add permissions, signers, unrelated programs or weakened minimums", async () => {
  for (const routeChange of [
    (r) => {
      r.inAmount = "999999";
    },
    (r) => {
      r.otherAmountThreshold = "1";
    },
    (r) => {
      r.platformFee = { feeBps: 1 };
    },
    (r) => {
      r.swapInstruction.programId = spl.TOKEN_PROGRAM_ID.toBase58();
    },
    (r) => {
      r.otherInstructions = [
        {
          programId: spl.TOKEN_PROGRAM_ID.toBase58(),
          accounts: [],
          data: "BA==",
        },
      ];
    },
    (r) => {
      r.swapInstruction.accounts.push({
        pubkey: key(),
        isSigner: true,
        isWritable: true,
      });
    },
    (r) => {
      r.setupInstructions = [
        {
          programId: spl.TOKEN_PROGRAM_ID.toBase58(),
          accounts: [],
          data: "BA==",
        },
      ];
    },
  ])
    await assert.rejects(
      builder({ routeChange }).prepare(),
      /route|signer|setup/,
    );
  const failure = builder({ simulationFailure: true });
  await assert.rejects(failure.prepare(), /failed simulation/);
  assert.equal(failure.calls.simulations, 1);
});

test("encoded Jupiter terms and destinations must match the review even when its JSON fields are correct", async () => {
  const base = {
    signer: buyer,
    source: staging,
    destination,
    inputMint: fundingMint,
    outputMint: stockMint,
  };
  for (const changes of [
    { amount: "2000000" },
    { out: "2000000" },
    { slippage: 900 },
    { destination: key() },
  ]) {
    const run = builder({
      routeChange: (route) => {
        route.swapInstruction = testJupiterInstruction({ ...base, ...changes });
      },
    });
    await assert.rejects(run.prepare(), /Encoded Jupiter/);
    assert.equal(
      run.calls.simulations,
      0,
      "Malformed instructions must fail before simulation",
    );
  }
  const trailing = builder({
    routeChange: (route) => {
      route.swapInstruction.data = Buffer.concat([
        Buffer.from(route.swapInstruction.data, "base64"),
        Buffer.from([0]),
      ]).toString("base64");
    },
  });
  await assert.rejects(trailing.prepare(), /Trailing bytes/);
  assert.equal(trailing.calls.simulations, 0);
});

function store(t, extraEnv = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "kite-investment-store-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const exports = loadModule(
    "investing-store",
    {
      "node:fs/promises": require("node:fs/promises"),
      "node:path": require("node:path"),
      "node:crypto": require("node:crypto"),
    },
    {
      process: {
        pid: process.pid,
        env: { KITE_INVESTING_STATE_DIR: directory, ...extraEnv },
      },
    },
  );
  return { ...exports, directory };
}

test("the persistent ledger writes private files and preserves old drafts that may already be approved", async (t) => {
  const s = store(t);
  const old = {
    plan: {
      ...clone(plan),
      status: "draft",
      createdAt: nowSeconds - 10 * 86400,
    },
    receipts: [],
  };
  await s.createInvestment(old);
  await s.createInvestment({
    plan: { ...clone(plan), id: "b".repeat(32) },
    receipts: [],
  });
  assert.equal((await s.readInvestment(plan.id)).plan.status, "draft");
  assert.equal(
    statSync(path.join(s.directory, `${plan.id}.json`)).mode & 0o777,
    0o600,
  );
  assert.equal(statSync(s.directory).mode & 0o777, 0o700);
  assert.equal((await s.investmentIds()).length, 2);
  const pendingRecord = {
    ...old,
    pending: {
      runId: `${plan.id}:0`,
      signedTransaction: "signed-bytes",
      signature: "signature",
      lastValidBlockHeight: 100,
    },
  };
  await s.writeInvestment(pendingRecord);
  assert.equal(
    (await s.readInvestment(plan.id)).pending.signedTransaction,
    "signed-bytes",
  );
  await s.createInvestment(old);
  assert.equal(
    (await s.readInvestment(plan.id)).pending.signedTransaction,
    "signed-bytes",
    "Replaying signed setup cannot erase execution history",
  );
  await assert.rejects(
    s.createInvestment({
      ...old,
      plan: { ...old.plan, amountUnits: "2000000" },
    }),
    /different terms/,
  );
  await assert.rejects(s.readInvestment("../outside"), /identifier/);
});

test("per-plan locks reject concurrent execution, allow independent plans and clean up after failure", async (t) => {
  const s = store(t);
  let resolveEntered, release;
  const entered = new Promise((resolve) => {
    resolveEntered = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const first = s.withInvestmentLock(plan.id, async () => {
    resolveEntered();
    await held;
  });
  await entered;
  await assert.rejects(
    s.withInvestmentLock(plan.id, async () =>
      assert.fail("Concurrent action must not start"),
    ),
    /already being processed/,
  );
  assert.equal(
    await s.withInvestmentLock("b".repeat(32), async () => "independent"),
    "independent",
  );
  release();
  await first;
  await assert.rejects(
    s.withInvestmentLock(plan.id, async () => {
      throw new Error("failure during processing");
    }),
    /failure during/,
  );
  assert.equal(existsSync(path.join(s.directory, `${plan.id}.lock`)), false);
  assert.equal(
    await s.withInvestmentLock(plan.id, async () => "recovered"),
    "recovered",
  );
});

test("serverless or nonprivate ledgers and stale process locks fail closed", async (t) => {
  const serverless = store(t, { VERCEL: "1" });
  assert.throws(
    () => serverless.investingStateDirectory(),
    /persistent server volume/,
  );
  const relative = store(t, { KITE_INVESTING_STATE_DIR: ".kite-data" });
  assert.throws(
    () => relative.investingStateDirectory(),
    /persistent server volume/,
  );
  const s = store(t);
  chmodSync(s.directory, 0o755);
  await assert.rejects(s.investmentIds(), /mode 0700/);
  chmodSync(s.directory, 0o700);
  writeFileSync(
    path.join(s.directory, `${plan.id}.lock`),
    JSON.stringify({ pid: 999999, at: 0 }),
    { mode: 0o600 },
  );
  await assert.rejects(
    s.withInvestmentLock(plan.id, async () => assert.fail()),
    /operator reconciliation/,
  );
  assert.equal(existsSync(path.join(s.directory, `${plan.id}.lock`)), true);
});

function service() {
  const records = new Map([[plan.id, { plan: clone(plan), receipts: [] }]]);
  const state = {
    now: nowSeconds * 1000,
    status: null,
    failBroadcast: false,
    outputAmount: "1002345",
    verificationRun: null,
  };
  const calls = {
    prepares: 0,
    broadcasts: 0,
    writes: 0,
    creates: 0,
    setupHash: null,
  };
  const locks = new Set();
  const makeOrder = (current, runId) => ({
    requestId: "review",
    transaction: "unsigned-test-transaction",
    authorization: "authorization",
    taker: current.buyer,
    expiresAt: state.now + 45000,
    transactionVersion: 1,
    serializedBytes: 300,
    lastValidBlockHeight: 100,
    investmentRun: { planId: current.id, runId },
  });
  const exports = loadModule(
    "investing",
    {
      "node:crypto": require("node:crypto"),
      "@solana/web3.js": web3,
      "@kite/sdk": {
        ...sdk,
        walletTransactionSignature: async () => "signature",
      },
      "./markets": {
        getServerMarketCatalog: async () => ({
          assets: [
            {
              mint: stockMint,
              symbol: "STOCK",
              verified: true,
              tradingHalted: false,
            },
            {
              mint: fundingMint,
              symbol: "TEST",
              verified: true,
              tradingHalted: false,
            },
          ],
          baskets: [],
          sources: ["xStocks issuer catalog", "PreStocks issuer catalog"],
        }),
      },
      "./mint-precision": { getTradeMintDecimals: async () => 6 },
      "./recurring-payments": {
        readDelegation: async (delegation) => {
          const record = [...records.values()].find(
            (record) => record.plan.delegation === delegation,
          );
          if (!record)
            throw new Error("The delegation does not exist or was revoked.");
          return {
            payment: {
              ...payment,
              ...{
                address: delegation,
                owner: record.plan.owner,
                buyer: record.plan.buyer,
              },
            },
          };
        },
        prepareRecurringPayment: async () => ({
          instructions: [],
          payment: { ...payment, address: key() },
          decimals: 6,
        }),
      },
      "./investing-order": {
        assertInvestmentMintsSupported: async () => {},
        prepareRecurringInvestmentOrder: async (current, runId) => {
          calls.prepares += 1;
          return { order: makeOrder(current, runId), outputs: [] };
        },
      },
      "./investing-health": {
        readExecutorHeartbeat: async () => ({
          healthy: true,
          lastSeenAt: Math.floor(state.now / 1000),
        }),
        recordExecutorHeartbeat: async () => {},
      },
      "./investing-store": {
        investingStateDirectory: () => "/private/test-only-volume",
        investmentIds: async () => [...records.keys()],
        readInvestment: async (id) => {
          if (!records.has(id)) throw new Error("missing plan");
          return clone(records.get(id));
        },
        writeInvestment: async (record) => {
          calls.writes += 1;
          records.set(record.plan.id, clone(record));
        },
        createInvestment: async (record) => {
          calls.creates += 1;
          records.set(record.plan.id, clone(record));
        },
        withInvestmentLock: async (id, action) => {
          if (locks.has(id))
            throw new Error("This investment is already being processed.");
          locks.add(id);
          try {
            return await action();
          } finally {
            locks.delete(id);
          }
        },
      },
      "./composed-transactions": {
        assertMainnetV1Ready: async (versions) =>
          assert.ok(versions.includes(1)),
        mainnetV1Active: async () => true,
        latestBlockhash: async () => ({
          blockhash: key(),
          lastValidBlockHeight: 100,
        }),
        simulateComposed: async () => ({ err: null }),
        authorizeComposed: async (order, run, hash) => {
          calls.setupHash = hash;
          return {
            ...order,
            authorization: "setup-authorization",
            requestId: "setup-review",
          };
        },
        verifyComposed: async () => ({
          taker: buyer,
          version: 1,
          lastValidBlockHeight: 100,
          investmentRun: state.verificationRun ?? {
            planId: plan.id,
            runId: `${plan.id}:0`,
          },
        }),
        mainnetRpc: async (method) => {
          if (method === "sendTransaction") {
            calls.broadcasts += 1;
            const stored = records.get(plan.id);
            assert.equal(
              stored.pending.signedTransaction,
              "signed-transaction",
              "The durable record must precede broadcast",
            );
            assert.equal(stored.receipts[0].status, "pending");
            if (state.failBroadcast)
              throw new Error("Transport failed after submission");
            return "signature";
          }
          if (method === "getSignatureStatuses")
            return { value: [state.status] };
          if (method === "getTransaction")
            return {
              meta: {
                fee: 7000,
                preTokenBalances: [],
                postTokenBalances: [
                  {
                    accountIndex: 1,
                    owner,
                    mint: stockMint,
                    uiTokenAmount: { amount: state.outputAmount, decimals: 6 },
                  },
                ],
              },
            };
          throw new Error(`Unexpected RPC ${method}`);
        },
      },
    },
    {
      Date: fixedDate(() => state.now),
      process: {
        env: {
          KITE_INVESTING_EXECUTOR: buyer,
          KITE_RECURRING_EXECUTOR_SECRET: "x".repeat(32),
        },
      },
    },
  );
  return { ...exports, records, calls, state, locks };
}

test("preparing an investment plan does not persist unsigned drafts and signed setup binds the exact owner and terms", async () => {
  const s = service();
  const review = await s.createInvestmentPlan({
    action: "create",
    taker: owner,
    target: { type: "stock", id: stockMint },
    fundingMint,
    amount: "1",
    schedule: {
      unit: "month",
      interval: 1,
      startsAt: nowSeconds + 600,
      occurrences: 3,
    },
    slippageBps: 100,
    consent: true,
    supportedTransactionVersions: [1],
  });
  assert.equal(s.calls.creates, 0);
  assert.equal(review.order.investmentSetup.id, review.plan.id);
  const hash = require("node:crypto")
    .createHash("sha256")
    .update(JSON.stringify(review.plan))
    .digest("hex");
  assert.equal(s.calls.setupHash, hash);
  await assert.rejects(
    s.storeSignedInvestmentSetup(
      { ...review.plan, amountUnits: "2000000" },
      owner,
      hash,
    ),
    /differ from the signed review/,
  );
  await assert.rejects(
    s.storeSignedInvestmentSetup(review.plan, key(), hash),
    /differ from the signed review/,
  );
  assert.equal(s.calls.creates, 0);
  await s.storeSignedInvestmentSetup(review.plan, owner, hash);
  assert.equal(s.calls.creates, 1);
  assert.equal(s.records.get(review.plan.id).plan.schedule.unit, "month");
});

test("executor persists before broadcasting and a lost response never triggers a replacement or second send", async () => {
  const s = service(),
    runId = `${plan.id}:0`;
  const order = await s.prepareInvestmentRun(plan.id, runId);
  assert.equal(
    (await s.prepareInvestmentRun(plan.id, runId)).transaction,
    order.transaction,
  );
  assert.equal(s.calls.prepares, 1);
  s.state.failBroadcast = true;
  assert.equal(
    (
      await s.recordInvestmentRun(
        plan.id,
        runId,
        "signed-transaction",
        order.authorization,
      )
    ).status,
    "pending",
  );
  s.state.now += 90000;
  assert.equal(
    (
      await s.recordInvestmentRun(
        plan.id,
        runId,
        "signed-transaction",
        order.authorization,
      )
    ).status,
    "pending",
  );
  assert.equal(s.calls.broadcasts, 1);
  assert.equal(s.calls.prepares, 1);
  await assert.rejects(
    s.recordInvestmentRun(
      plan.id,
      runId,
      "replacement-transaction",
      order.authorization,
    ),
    /awaiting reconciliation/,
  );
  await assert.rejects(
    s.prepareInvestmentRun(plan.id, runId),
    /requires reconciliation/,
  );
  assert.equal((await s.dueInvestments()).runs.length, 0);
  assert.equal(
    s.records.get(plan.id).pending.signedTransaction,
    "signed-transaction",
  );
});

test("reconciliation records actual chain delivery, fees and final failure without quoted receipts", async () => {
  const s = service(),
    runId = `${plan.id}:0`;
  await s.prepareInvestmentRun(plan.id, runId);
  await s.recordInvestmentRun(
    plan.id,
    runId,
    "signed-transaction",
    "authorization",
  );
  s.state.status = { err: null, confirmationStatus: "confirmed" };
  assert.equal(
    (await s.reconcileInvestmentRun(plan.id, runId)).status,
    "success",
  );
  const receipt = s.records.get(plan.id).receipts[0];
  assert.equal(receipt.outputs[0].amountUnits, "1002345");
  assert.equal(receipt.feeLamports, 7000);
  assert.equal(s.records.get(plan.id).pending, undefined);
  assert.equal(
    (
      await s.recordInvestmentRun(
        plan.id,
        runId,
        "signed-transaction",
        "authorization",
      )
    ).status,
    "success",
  );
  assert.equal(s.calls.broadcasts, 1);
  const failed = service();
  await failed.prepareInvestmentRun(plan.id, runId);
  await failed.recordInvestmentRun(
    plan.id,
    runId,
    "signed-transaction",
    "authorization",
  );
  failed.state.status = {
    err: { InstructionError: [1, "Custom"] },
    confirmationStatus: "confirmed",
  };
  assert.equal(
    (await failed.reconcileInvestmentRun(plan.id, runId)).status,
    "failed",
  );
  assert.equal(failed.records.get(plan.id).pending, undefined);
});

test("an expired never-submitted review is discarded without replacing its authorization or broadcasting", async () => {
  const s = service(),
    runId = `${plan.id}:0`;
  const original = await s.prepareInvestmentRun(plan.id, runId);
  await assert.rejects(
    s.discardInvestmentRun(plan.id, runId, original.authorization),
    /Only an expired/,
  );
  s.state.now += 60000;
  assert.equal(
    (await s.prepareInvestmentRun(plan.id, runId)).expiresAt,
    original.expiresAt,
  );
  assert.equal(s.calls.prepares, 1);
  await assert.rejects(
    s.discardInvestmentRun(plan.id, runId, "another-authorization"),
    /Only an expired/,
  );
  assert.equal(
    (await s.discardInvestmentRun(plan.id, runId, original.authorization))
      .status,
    "failed",
  );
  assert.equal(s.calls.broadcasts, 0);
  assert.equal(s.records.get(plan.id).prepared, undefined);
  assert.equal((await s.dueInvestments()).runs.length, 0);
});

test("run authorizations cannot be replayed across periods and a stale lock does not starve independent plans", async () => {
  const s = service(),
    runId = `${plan.id}:0`;
  await s.prepareInvestmentRun(plan.id, runId);
  s.state.verificationRun = { planId: plan.id, runId: `${plan.id}:1` };
  await assert.rejects(
    s.recordInvestmentRun(
      plan.id,
      runId,
      "signed-transaction",
      "authorization",
    ),
    /this occurrence/,
  );
  assert.equal(s.calls.broadcasts, 0);
  const other = { ...clone(plan), id: "b".repeat(32), delegation: key() };
  s.records.set(other.id, { plan: other, receipts: [] });
  s.locks.add(plan.id);
  const { runs } = await s.dueInvestments();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].planId, other.id);
});
