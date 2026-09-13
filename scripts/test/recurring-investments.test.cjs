const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const {
  createLedger,
  acquireWorkerLock,
  runWorkerCycle,
  createExecutorApi,
  loadSigner,
} = require("../run-recurring-investments.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kite-recurring-worker-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, ledger: createLedger(root) };
}
const run = { planId: "plan-1", runId: "plan-1:0", scheduledAt: 1000 };
const order = {
  ...run,
  taker: "buyer",
  transactionVersion: 1,
  expiresAt: 60_000,
  authorization: "authorization",
  lastValidBlockHeight: 10,
};
const signature = "test-signature";
const signedTransaction = "test-signed-bytes";
const signed = async () => ({ signature, signedTransaction });
const pending = {
  ...run,
  status: "pending",
  signature,
  signedTransaction,
  authorization: "authorization",
  expiresAt: 60_000,
};

test("persist signed intent before broadcast and never sign the same run again", async (t) => {
  const { ledger, root } = fixture(t);
  let signatures = 0;
  let records = 0;
  const api = async (input) => {
    if (!input) return { runs: [run] };
    if (input.action === "prepare") return order;
    if (input.action === "record") {
      records += 1;
      assert.equal(
        ledger.read(run.planId, run.runId).signedTransaction,
        signedTransaction,
      );
      const file = fs.readdirSync(root).find((name) => name.endsWith(".json"));
      assert.equal(fs.statSync(path.join(root, file)).mode & 0o777, 0o600);
      return { status: "success", signature };
    }
    throw new Error("unexpected call");
  };
  const options = {
    api,
    ledger,
    signOrder: async () => {
      signatures += 1;
      return signed();
    },
    buyer: "buyer",
    now: () => 1000,
    log: () => {},
  };
  await runWorkerCycle(options);
  await runWorkerCycle(options);
  assert.equal(signatures, 1);
  assert.equal(records, 1);
  assert.equal(ledger.read(run.planId, run.runId).status, "success");
});

test("a lost broadcast response survives restart and reuses exactly the persisted signed bytes", async (t) => {
  const { root, ledger } = fixture(t);
  const recordBodies = [];
  let failed = false;
  const api = async (input) => {
    if (!input) return { runs: [run] };
    if (input.action === "prepare") return order;
    if (input.action === "reconcile") return { status: "pending", signature };
    if (input.action === "record") {
      recordBodies.push(input);
      if (!failed) {
        failed = true;
        throw new Error("response lost after broadcast");
      }
      return { status: "success", signature };
    }
  };
  await runWorkerCycle({
    api,
    ledger,
    signOrder: signed,
    buyer: "buyer",
    now: () => 1000,
    log: () => {},
  });
  assert.equal(ledger.pending().length, 1);
  const reopened = createLedger(root);
  await runWorkerCycle({
    api,
    ledger: reopened,
    signOrder: () => assert.fail("Must not create another signature"),
    buyer: "buyer",
    now: () => 2000,
    log: () => {},
  });
  assert.equal(recordBodies.length, 2);
  assert.deepEqual(recordBodies[0], recordBodies[1]);
  assert.equal(reopened.pending().length, 0);
});

test("an ambiguous expired transaction blocks new occurrences without catching up", async (t) => {
  const { ledger } = fixture(t);
  ledger.write({ ...pending, expiresAt: 1000 });
  const calls = [];
  await runWorkerCycle({
    ledger,
    buyer: "buyer",
    signOrder: () => assert.fail("Unknown outcome cannot be replaced"),
    now: () => 2000,
    log: () => {},
    api: async (input) => {
      calls.push(input?.action ?? "due");
      if (input?.action === "reconcile")
        return { status: "pending", signature };
      if (!input) return { runs: [{ ...run, runId: "plan-1:1" }] };
      assert.fail(
        "Expired unknown intent must not be rebroadcast or prepared again",
      );
    },
  });
  assert.deepEqual(calls, ["reconcile", "due"]);
  assert.equal(ledger.pending().length, 1);
});

test("an expired signed intent that never reached the server is recorded for definitive recovery", async (t) => {
  const { ledger } = fixture(t);
  ledger.write({ ...pending, expiresAt: 1000 });
  const calls = [];
  await runWorkerCycle({
    ledger,
    buyer: "buyer",
    signOrder: () => assert.fail("Never replace persisted signed bytes"),
    now: () => 2000,
    log: () => {},
    api: async (input) => {
      calls.push(input?.action ?? "due");
      if (input?.action === "reconcile") return { status: "prepared" };
      if (input?.action === "record") {
        assert.equal(input.signedTransaction, signedTransaction);
        return { status: "failed", signature };
      }
      if (!input) return { runs: [] };
      assert.fail("Only the existing signed intent can be recovered");
    },
  });
  assert.deepEqual(calls, ["reconcile", "record", "due"]);
  assert.equal(ledger.read(run.planId, run.runId).status, "failed");
});

test("a review that expires before signing is discarded under the server lock", async (t) => {
  const { ledger } = fixture(t);
  const calls = [];
  await runWorkerCycle({
    ledger,
    buyer: "buyer",
    signOrder: () => assert.fail("An expired review cannot be signed"),
    now: () => 2000,
    log: () => {},
    api: async (input) => {
      calls.push(input?.action ?? "due");
      if (!input) return { runs: [run] };
      if (input.action === "prepare") return { ...order, expiresAt: 1000 };
      if (input.action === "discard") {
        assert.equal(input.authorization, order.authorization);
        return { status: "failed" };
      }
      assert.fail("An unsigned order must never enter the broadcast path");
    },
  });
  assert.deepEqual(calls, ["due", "prepare", "discard"]);
  assert.equal(ledger.read(run.planId, run.runId).status, "failed");
  assert.equal(ledger.read(run.planId, run.runId).signature, undefined);
});

test("one unresolved plan does not block an independent investor's due purchase", async (t) => {
  const { ledger } = fixture(t);
  ledger.write({ ...pending, expiresAt: 1000 });
  const independent = { ...run, planId: "plan-2", runId: "plan-2:0" };
  await runWorkerCycle({
    ledger,
    buyer: "buyer",
    signOrder: signed,
    now: () => 2000,
    log: () => {},
    api: async (input) => {
      if (input?.action === "reconcile")
        return { status: "pending", signature };
      if (!input) return { runs: [{ ...run, runId: "plan-1:1" }, independent] };
      assert.equal(input.planId, independent.planId);
      if (input.action === "prepare") return { ...order, ...independent };
      if (input.action === "record") return { status: "success", signature };
    },
  });
  assert.equal(ledger.read(run.planId, run.runId).status, "pending");
  assert.equal(
    ledger.read(independent.planId, independent.runId).status,
    "success",
  );
});

test("definitive onchain failure permits a later scheduled occurrence, without retrying the failed one", async (t) => {
  const { ledger } = fixture(t);
  ledger.write(pending);
  const later = { ...run, runId: "plan-1:1" };
  const calls = [];
  await runWorkerCycle({
    ledger,
    buyer: "buyer",
    signOrder: signed,
    now: () => 2000,
    log: () => {},
    api: async (input) => {
      calls.push(input);
      if (input?.action === "reconcile") return { status: "failed", signature };
      if (!input) return { runs: [run, later] };
      if (input.action === "prepare") return { ...order, ...later };
      if (input.action === "record") return { status: "success", signature };
    },
  });
  assert.deepEqual(
    calls
      .filter((input) => input?.action === "prepare")
      .map((input) => input.runId),
    [later.runId],
  );
  assert.equal(ledger.read(run.planId, run.runId).status, "failed");
});

test("invalid signer, V0 response, or changed signature cannot advance the ledger", async (t) => {
  const { ledger } = fixture(t);
  for (const invalid of [
    { taker: "someone-else" },
    { transactionVersion: 0 },
    { runId: "different-run" },
  ]) {
    await runWorkerCycle({
      ledger,
      buyer: "buyer",
      signOrder: () => assert.fail("Invalid order must not be signed"),
      now: () => 1000,
      log: () => {},
      api: async (input) =>
        input ? { ...order, ...invalid } : { runs: [run] },
    });
    assert.equal(ledger.read(run.planId, run.runId), null);
  }
  ledger.write(pending);
  await runWorkerCycle({
    ledger,
    buyer: "buyer",
    signOrder: () => assert.fail(),
    now: () => 1000,
    log: () => {},
    api: async (input) =>
      input
        ? { status: "success", signature: "different-signature" }
        : { runs: [] },
  });
  assert.equal(ledger.read(run.planId, run.runId).status, "pending");
});

test("the local ledger excludes concurrent workers and recovers a dead local process", (t) => {
  const { ledger, root } = fixture(t);
  const release = acquireWorkerLock(root);
  assert.throws(() => acquireWorkerLock(root), /Another recurring/);
  release();
  const { spawnSync } = require("node:child_process");
  const child = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(String(process.pid))"],
    { encoding: "utf8" },
  );
  fs.writeFileSync(
    path.join(root, "worker.lock"),
    JSON.stringify({ pid: Number(child.stdout), hostname: os.hostname() }),
    { mode: 0o600 },
  );
  const recovered = acquireWorkerLock(ledger.root);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "worker.lock"), "utf8")).pid,
    process.pid,
  );
  recovered();
});

test("credential-bearing, insecure and redirected origins fail closed", () => {
  const secret = "x".repeat(32);
  for (const url of [
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com?key=123",
    "https://example.com#fragment",
  ])
    assert.throws(() => createExecutorApi(url, secret), /HTTPS/);
  assert.throws(
    () => createExecutorApi("https://example.com", "short"),
    /at least 32/,
  );
  assert.equal(
    typeof createExecutorApi("http://127.0.0.1:3000", secret),
    "function",
  );
});

test("Kit 8 signs an isolated V1 transaction and rejects V0 without any network calls", async (t) => {
  const { root } = fixture(t);
  const sdkRequire = createRequire(
    path.resolve(__dirname, "../../packages/sdk/package.json"),
  );
  const { Keypair } = sdkRequire("@solana/web3.js");
  const kit = sdkRequire("@solana/kit-v1");
  const key = Keypair.generate();
  const keyFile = path.join(root, "ephemeral-test-key.json");
  fs.writeFileSync(keyFile, JSON.stringify([...key.secretKey]), {
    mode: 0o600,
  });
  const signer = await loadSigner(keyFile);
  assert.equal(signer.buyer, key.publicKey.toBase58());
  const create = (version) => {
    let message = kit.createTransactionMessage({ version });
    message = kit.setTransactionMessageFeePayer(
      kit.address(signer.buyer),
      message,
    );
    message = kit.setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: kit.blockhash(Keypair.generate().publicKey.toBase58()),
        lastValidBlockHeight: 10n,
      },
      message,
    );
    if (version === 1) {
      message = kit.setTransactionMessageComputeUnitLimit(200000, message);
      message = kit.setTransactionMessageLoadedAccountsDataSizeLimit(
        1000000,
        message,
      );
      message = kit.setTransactionMessagePriorityFeeLamports(1000n, message);
    }
    return Buffer.from(
      kit.getTransactionEncoder().encode(kit.compileTransaction(message)),
    ).toString("base64");
  };
  const transaction = create(1);
  const result = await signer.signOrder({ taker: signer.buyer, transaction });
  const decoded = kit
    .getTransactionDecoder()
    .decode(Buffer.from(result.signedTransaction, "base64"));
  assert.equal(
    await kit.verifySignature(
      await kit.getPublicKeyFromAddress(kit.address(signer.buyer)),
      decoded.signatures[signer.buyer],
      decoded.messageBytes,
    ),
    true,
  );
  await assert.rejects(
    () => signer.signOrder({ taker: signer.buyer, transaction: create(0) }),
    /must be V1/,
  );
});
