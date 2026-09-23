import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { generateKeyPairSync, sign } from "node:crypto";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { PublicKey } = require("@solana/web3.js");
const DEVNET = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const MAINNET = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const wallet = new PublicKey(
  publicKey.export({ format: "der", type: "spki" }).subarray(-32),
).toBase58();
const compile = (path) =>
  ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
function load(path, overrides = {}, globals = {}) {
  const exports = {};
  runInNewContext(compile(path), {
    exports,
    Buffer,
    TextDecoder,
    Uint8Array,
    AbortSignal,
    Date,
    require: (name) => overrides[name] ?? require(name),
    ...globals,
  });
  return exports;
}
const policy = load("../lib/server/recurring-devnet-policy.ts");
const create = () => ({
  schemaVersion: 1,
  owner: wallet,
  target: { type: "stock", id: "AAPL" },
  amount: "10.123456",
  periodSeconds: 60,
  periods: 10,
  supportedTransactionVersions: [1],
});

test("devnet requests reject legacy mainnet buyer/delegation schemas and caller-supplied swap instructions", () => {
  assert.throws(
    () =>
      policy.parseCreateDevnetPlan({
        taker: wallet,
        buyer: wallet,
        mint: wallet,
        amount: "10",
      }),
    /Legacy|schemaVersion/,
  );
  for (const forbidden of [
    "buyer",
    "mint",
    "network",
    "instructions",
    "destination",
    "minimumAmountOut",
  ]) {
    assert.throws(
      () => policy.parseCreateDevnetPlan({ ...create(), [forbidden]: wallet }),
      /Legacy/,
    );
  }
  const collect = {
    schemaVersion: 1,
    plan: wallet,
    feePayer: wallet,
    expectedPeriodIndex: 0,
  };
  assert.equal(policy.parseCollectDevnetPlan(collect).expectedPeriodIndex, 0);
  for (const forbidden of [
    "amount",
    "destination",
    "pool",
    "instructions",
    "buyer",
    "delegation",
    "minimumAmountOut",
  ]) {
    assert.throws(
      () => policy.parseCollectDevnetPlan({ ...collect, [forbidden]: "1" }),
      /Legacy/,
    );
  }
  for (const index of [-1, 365, 0.1, "0", NaN])
    assert.throws(
      () =>
        policy.parseCollectDevnetPlan({
          ...collect,
          expectedPeriodIndex: index,
        }),
      /period index/,
    );
});

test("plan creation accepts explicit stock/basket targets and bounds integer terms and exact decimal amounts", () => {
  assert.equal(policy.parseCreateDevnetPlan(create()).amount, "10.123456");
  assert.equal(
    policy.parseCreateDevnetPlan({
      ...create(),
      target: { type: "basket", id: "mag7" },
    }).target.type,
    "basket",
  );
  for (const amount of [
    "0",
    "-1",
    "1e3",
    "Infinity",
    "0.0000001",
    "1.1234567",
    " 10",
    "01",
    10,
  ])
    assert.throws(
      () => policy.parseCreateDevnetPlan({ ...create(), amount }),
      /positive test-token/,
    );
  for (const terms of [
    { periodSeconds: 59 },
    { periodSeconds: 60.5 },
    { periods: 0 },
    { periods: 366 },
    { periods: 365, periodSeconds: 604800 },
  ])
    assert.throws(
      () => policy.parseCreateDevnetPlan({ ...create(), ...terms }),
      /one year/,
    );
  assert.throws(
    () =>
      policy.parseCreateDevnetPlan({
        ...create(),
        supportedTransactionVersions: [0],
      }),
    /V1/,
  );
  assert.throws(
    () =>
      policy.parseCreateDevnetPlan({
        ...create(),
        target: { type: "stock", id: "AAPL", pool: wallet },
      }),
    /Legacy/,
  );
});

const fixtureSignature = "devnet-signed-message-fixture";
function transport({ genesis = DEVNET, env = {}, inspect, rpcResult } = {}) {
  const calls = [];
  const exports = load(
    "../lib/server/recurring-devnet-transport.ts",
    {
      "@kite/sdk": {
        DEVNET_GENESIS_HASH: DEVNET,
        walletTransactionSignature: async () => fixtureSignature,
        inspectWalletTransaction:
          inspect ??
          (async (encoded) => {
            const input = JSON.parse(Buffer.from(encoded, "base64").toString());
            return {
              transaction: {
                messageBytes: Buffer.from(input.message),
                signatures: Object.fromEntries(
                  Object.entries(input.signatures).map(([key, value]) => [
                    key,
                    value ? Buffer.from(value, "base64") : null,
                  ]),
                ),
              },
              message: JSON.parse(input.message),
            };
          }),
      },
    },
    {
      process: {
        env: {
          KITE_RECURRING_AUTH_SECRET:
            "recurring-authorization-only-test-secret-32",
          ...env,
        },
      },
      fetch: async (url, request) => {
        const body = JSON.parse(request.body);
        calls.push({ url, ...body });
        if (body.method === "getGenesisHash")
          return { ok: true, json: async () => ({ result: genesis }) };
        if (rpcResult)
          return {
            ok: true,
            json: async () => ({
              result: await rpcResult(body.method, body.params),
            }),
          };
        throw new Error(`Unexpected RPC method ${body.method}`);
      },
    },
  );
  return { ...exports, calls };
}

test("recurring RPC is independent of mainnet RPC and rejects every other cluster by genesis", async () => {
  const api = transport({
    env: { SOLANA_RPC_URL: "https://mainnet.example.invalid" },
  });
  await api.assertRecurringDevnet();
  assert.equal(api.calls[0].url, "https://api.devnet.solana.com");
  const privateRpc = transport({
    env: { KITE_RECURRING_RPC_URL: "https://private-devnet.example.invalid" },
  });
  await privateRpc.assertRecurringDevnet();
  assert.equal(
    privateRpc.calls[0].url,
    "https://private-devnet.example.invalid",
  );
  await assert.rejects(
    () => transport({ genesis: MAINNET }).assertRecurringDevnet(),
    /restricted to Solana devnet/,
  );
  await assert.rejects(
    () => transport({ genesis: "testnet" }).assertRecurringDevnet(),
    /restricted to Solana devnet/,
  );
});

function encodedTransaction({
  signed = false,
  amount = "10",
  payer = wallet,
} = {}) {
  const message = JSON.stringify({
    version: 1,
    staticAccounts: [payer],
    amount,
  });
  return Buffer.from(
    JSON.stringify({
      message,
      signatures: {
        [payer]: signed
          ? sign(null, Buffer.from(message), privateKey).toString("base64")
          : null,
      },
    }),
  ).toString("base64");
}
async function authorized(api, options = {}) {
  return api.authorizeRecurringTransaction({
    transaction: encodedTransaction(),
    signer: wallet,
    plan: wallet,
    operation: "create",
    expiresAt: Date.now() + 45_000,
    lastValidBlockHeight: 1000,
    ...options,
  });
}

test("devnet authorizations require the exact reviewed message and a real Ed25519 wallet signature", async () => {
  const api = transport();
  const order = await authorized(api);
  assert.equal(order.network, "devnet");
  assert.equal(order.protocolVersion, 2);
  const result = await api.verifyRecurringTransaction(
    order.authorization,
    encodedTransaction({ signed: true }),
  );
  assert.equal(result.signer, wallet);
  await assert.rejects(
    () =>
      api.verifyRecurringTransaction(order.authorization, encodedTransaction()),
    /valid wallet signature/,
  );
  await assert.rejects(
    () =>
      api.verifyRecurringTransaction(
        order.authorization,
        encodedTransaction({ signed: true, amount: "11" }),
      ),
    /differs from the reviewed/,
  );
  await assert.rejects(
    () =>
      api.verifyRecurringTransaction(
        order.authorization + ".extra",
        encodedTransaction({ signed: true }),
      ),
    /Invalid/,
  );
  await assert.rejects(
    () =>
      api.verifyRecurringTransaction(
        order.authorization.slice(0, -4) + "aaaa",
        encodedTransaction({ signed: true }),
      ),
    /Invalid/,
  );
  const expired = await authorized(api, { expiresAt: Date.now() - 1 });
  await assert.rejects(
    () =>
      api.verifyRecurringTransaction(
        expired.authorization,
        encodedTransaction({ signed: true }),
      ),
    /expired/,
  );
});

test("signed devnet transactions are never broadcast through an RPC that switched to mainnet", async () => {
  const api = transport({ genesis: MAINNET });
  const order = await authorized(api);
  await assert.rejects(
    () =>
      api.executeRecurringTransaction({
        authorization: order.authorization,
        signedTransaction: encodedTransaction({ signed: true }),
      }),
    /restricted to Solana devnet/,
  );
  assert.deepEqual(
    api.calls.map((call) => call.method),
    ["getGenesisHash"],
  );
});

test("missing authorization configuration cannot silently create an unsigned authorization token", async () => {
  const api = transport({ env: { KITE_RECURRING_AUTH_SECRET: "" } });
  assert.equal(api.recurringAuthorizationConfigured(), false);
  await assert.rejects(() => authorized(api), /not configured/);
});

function executionRpc(overrides = {}) {
  const feature = Buffer.alloc(9);
  feature[0] = 1;
  feature.writeBigUInt64LE(1n, 1);
  return async (method, params) => {
    if (overrides[method]) return overrides[method](params);
    if (method === "getAccountInfo")
      return {
        value: {
          owner: "Feature111111111111111111111111111111111111",
          data: [feature.toString("base64"), "base64"],
        },
      };
    if (method === "getSlot") return 10;
    if (method === "getBlockHeight") return 500;
    if (method === "getSignatureStatuses") return { value: [null] };
    if (method === "simulateTransaction") return { value: { err: null } };
    if (method === "sendTransaction") return fixtureSignature;
    throw new Error(`Unhandled fixture RPC ${method}`);
  };
}

test("a lost broadcast response preserves the local signature and exact-message retry recovers before simulation", async () => {
  let sent = false;
  const api = transport({
    rpcResult: executionRpc({
      sendTransaction: () => {
        sent = true;
        throw new Error(
          "Connection lost after the node accepted the transaction",
        );
      },
      getSignatureStatuses: () => ({
        value: [sent ? { err: null, confirmationStatus: "confirmed" } : null],
      }),
    }),
  });
  const order = await authorized(api);
  const request = {
    authorization: order.authorization,
    signedTransaction: encodedTransaction({ signed: true }),
  };
  const unknown = await api.executeRecurringTransaction(request);
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.signature, fixtureSignature);
  const recovered = await api.executeRecurringTransaction(request);
  assert.equal(recovered.status, "confirmed");
  const broadcasts = api.calls.filter(
    (call) => call.method === "sendTransaction",
  );
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0].params[0], request.signedTransaction);
  assert.equal(
    api.calls.filter((call) => call.method === "simulateTransaction").length,
    1,
  );
});

test("expired authorizations can recover status but cannot submit an unobserved transaction", async () => {
  const api = transport({ rpcResult: executionRpc() });
  const order = await authorized(api, { expiresAt: Date.now() - 1 });
  const result = await api.executeRecurringTransaction({
    authorization: order.authorization,
    signedTransaction: encodedTransaction({ signed: true }),
  });
  assert.equal(result.status, "unknown");
  assert.equal(
    api.calls.some((call) => call.method === "sendTransaction"),
    false,
  );
  assert.equal(
    api.calls.some((call) => call.method === "simulateTransaction"),
    false,
  );
});

test("blockhash expiry rechecks signature status after height observation before allowing a new review", async () => {
  for (const landed of [false, true]) {
    let reads = 0;
    const api = transport({
      rpcResult: executionRpc({
        getBlockHeight: () => 1001,
        getSignatureStatuses: () => ({
          value: [
            ++reads === 2 && landed
              ? { err: null, confirmationStatus: "confirmed" }
              : null,
          ],
        }),
      }),
    });
    const order = await authorized(api);
    const result = await api.executeRecurringTransaction({
      authorization: order.authorization,
      signedTransaction: encodedTransaction({ signed: true }),
    });
    assert.equal(result.status, landed ? "confirmed" : "expired");
    assert.equal(reads, 2);
    assert.equal(
      api.calls.some((call) => call.method === "sendTransaction"),
      false,
    );
  }
});

const sdk = require("@kite/sdk");
const fixture = (label) =>
  new PublicKey(
    require("node:crypto")
      .createHash("sha256")
      .update(`server-recurring-fixture:${label}`)
      .digest(),
  ).toBase58();
async function fixturePlan() {
  const fundingMint = fixture("KUSD"),
    outputMint = fixture("xAAPL");
  const pool = {
    pool: fixture("pool"),
    ammConfig: fixture("config"),
    inputVault: fixture("input-vault"),
    outputVault: fixture("output-vault"),
    observation: fixture("observation"),
    fundingMint,
    outputMint,
    inputFees: 0n,
    outputFees: 0n,
    openTime: 1n,
    swapsEnabled: true,
    creatorFeeEnabled: false,
  };
  return (
    await sdk.buildGuardCreateInstructions({
      owner: wallet,
      fundingMint,
      nonce: 2n,
      fundingAmount: 10000000n,
      periodSeconds: 60n,
      periods: 3,
      startsAt: 1800000000n,
      expiresAt: 1800000180n,
      initializeAuthority: true,
      pools: [pool],
      outputs: [
        {
          mint: outputMint,
          weightBps: 10000,
          minimumAmountOut: 100n,
          pool: pool.pool,
        },
      ],
    })
  ).plan;
}
function backend({ plan, protocolFailure = false, delegation } = {}) {
  const calls = [],
    composed = [];
  const programs = new Set([
    sdk.KITE_GUARD_PROGRAM_ID.toBase58(),
    sdk.DEVNET_RAYDIUM_CPMM_PROGRAM.toBase58(),
    sdk.MAINNET_SUBSCRIPTIONS_PROGRAM,
  ]);
  const rpc = async (method, params = []) => {
    calls.push({ method, params });
    if (method === "getSlot") return 10;
    if (method === "getBlockTime") return 1800000061;
    if (method === "getProgramAccounts") return [];
    if (method === "getMultipleAccounts")
      return {
        value: params[0].map((address) => {
          if (programs.has(address))
            return {
              owner: "BPFLoaderUpgradeab1e11111111111111111111111",
              executable: true,
              lamports: 1,
              data: ["", "base64"],
            };
          if (address === plan?.address)
            return {
              owner: sdk.KITE_GUARD_PROGRAM_ID.toBase58(),
              executable: false,
              lamports: 1,
              data: [Buffer.alloc(1045).toString("base64"), "base64"],
            };
          if (address === plan?.recurringDelegation) return delegation ?? null;
          throw new Error(`Unexpected account lookup ${address}`);
        }),
      };
    throw new Error(`Unexpected RPC ${method}`);
  };
  const exports = load(
    "../lib/server/recurring-devnet.ts",
    {
      "@kite/sdk": {
        ...sdk,
        decodeGuardPlan: () => plan,
        decodeGuardPlanV2: () => plan,
        composeV1Transaction: async (params) => {
          composed.push(params);
          return { transaction: "reviewed-fixture", transactionVersion: 1 };
        },
      },
      "../../public/xstocks-devnet/xstocks.json": {
        default: sdk.createUnprovisionedDevnetManifest(),
      },
      "./recurring-devnet-transport": {
        assertRecurringDevnet: async () => {
          calls.push({ method: "assertDevnet" });
        },
        assertRecurringV1: async () => {
          calls.push({ method: "assertDevnetV1" });
        },
        recurringAuthorizationConfigured: () => true,
        recurringV1Active: async () => true,
        recurringLatestBlockhash: async () => ({
          blockhash: fixture("blockhash"),
          lastValidBlockHeight: 1000,
        }),
        recurringDevnetRpc: rpc,
        simulateRecurring: async (_transaction, expected) => {
          if (expected && protocolFailure)
            throw new Error("Unsupported deployed protocol v1");
        },
        authorizeRecurringTransaction: async (value) => ({
          ...value,
          network: "devnet",
        }),
      },
    },
    { process: { env: { KITE_RECURRING_POOLS: "{}" } } },
  );
  return { ...exports, calls, composed };
}

test("unprovisioned catalog stays visibly blocked without inventing mints, pools, or contract readiness", async () => {
  const api = backend();
  const config = await api.getDevnetRecurringConfig();
  assert.equal(config.network, "devnet");
  assert.equal(config.status, "blocked");
  assert.equal(config.readyToPrepare, false);
  assert.equal(config.fundingToken, null);
  assert.equal(config.stocks.length, 40);
  assert.equal(config.baskets.length, 10);
  assert.equal(
    config.stocks.some((stock) => stock.available),
    false,
  );
  assert.match(config.reasons.join(" "), /Provision.*KUSD/);
  await assert.rejects(
    () => api.createDevnetRecurringPlan(create()),
    /has not been provisioned/,
  );
});

test("plan listing scopes chain queries to account size and the selected owner", async () => {
  const api = backend();
  assert.equal((await api.listDevnetRecurringPlans(wallet)).length, 0);
  const request = api.calls.find(
    (call) => call.method === "getProgramAccounts",
  );
  assert.equal(request.params[0], sdk.KITE_GUARD_PROGRAM_ID.toBase58());
  assert.equal(request.params[1].filters[0].dataSize, 1045);
  assert.equal(request.params[1].filters[1].memcmp.offset, 10);
  assert.equal(request.params[1].filters[1].memcmp.bytes, wallet);
});

test("stale collection and already executed periods stop before fetching any token route", async () => {
  const plan = await fixturePlan();
  const stale = backend({ plan });
  await assert.rejects(
    () =>
      stale.collectDevnetRecurringPlan({
        plan: plan.address,
        feePayer: wallet,
        expectedPeriodIndex: 0,
      }),
    /stale or not yet due/,
  );
  assert.equal(
    stale.composed.length,
    0,
    "no transaction was composed because period is stale",
  );
  const replay = backend({
    plan: {
      ...plan,
      lastExecutedPeriod: 1,
      executedPeriods: 1,
      lastExecutedAt: plan.startsAt + 61n,
    },
  });
  await assert.rejects(
    () =>
      replay.collectDevnetRecurringPlan({
        plan: plan.address,
        feePayer: wallet,
        expectedPeriodIndex: 1,
      }),
    /already collected/,
  );
});

test("owner can close a plan after its delegation was revoked, without a manifest or pool", async () => {
  const plan = await fixturePlan();
  for (const delegation of [
    undefined,
    {
      owner: "11111111111111111111111111111111",
      data: ["", "base64"],
      executable: false,
      lamports: 0,
    },
  ]) {
    const api = backend({ plan, delegation });
    const result = await api.closeDevnetRecurringPlan({
      plan: plan.address,
      owner: wallet,
      supportedTransactionVersions: [1],
    });
    assert.equal(result.operation, "close");
    assert.equal(result.plan, plan.address);
    const close = api.composed.at(-1).instructions.at(-1);
    assert.equal(
      close.keys[3].pubkey.toBase58(),
      wallet,
      "closed permission has no separate rent recipient",
    );
  }
  await assert.rejects(
    () =>
      backend({ plan }).closeDevnetRecurringPlan({
        plan: plan.address,
        owner: fixture("not-owner"),
        supportedTransactionVersions: [1],
      }),
    /Only the plan owner/,
  );
});
