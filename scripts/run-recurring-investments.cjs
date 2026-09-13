#!/usr/bin/env node
/** Buyer-controlled signer. It never collects funding separately from investment delivery. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");

class WorkerError extends Error {}

function atomicJson(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value));
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
  const directory = fs.openSync(path.dirname(file), "r");
  try {
    fs.fsyncSync(directory);
  } finally {
    fs.closeSync(directory);
  }
}

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function createLedger(directory) {
  const root = path.resolve(directory);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const metadata = fs.lstatSync(root);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o077) !== 0
  )
    throw new WorkerError(
      "The worker ledger must be a private directory with mode 0700.",
    );
  const filename = (planId, runId) => {
    if (!validId(planId) || !validId(runId))
      throw new WorkerError("The executor returned an invalid run identity.");
    return path.join(
      root,
      `${crypto.createHash("sha256").update(`${planId}\0${runId}`).digest("hex")}.json`,
    );
  };
  return {
    root,
    read(planId, runId) {
      const file = filename(planId, runId);
      return fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, "utf8"))
        : null;
    },
    write(entry) {
      atomicJson(filename(entry.planId, entry.runId), entry);
    },
    pending() {
      return fs
        .readdirSync(root)
        .filter((file) => /^[a-f0-9]{64}\.json$/.test(file))
        .map((file) =>
          JSON.parse(fs.readFileSync(path.join(root, file), "utf8")),
        )
        .filter((entry) => entry.status === "pending");
    },
  };
}

/** One signer process per local ledger. Recovery is serialized before examining a stale lock. */
function acquireWorkerLock(root) {
  const file = path.join(root, "worker.lock");
  const recoveryFile = path.join(root, "worker-recovery.lock");
  const token = crypto.randomUUID();
  const value = JSON.stringify({
    pid: process.pid,
    hostname: os.hostname(),
    token,
  });
  let descriptor;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      descriptor = fs.openSync(file, "wx", 0o600);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let recovery;
      try {
        recovery = fs.openSync(recoveryFile, "wx", 0o600);
      } catch {
        throw new WorkerError(
          "Another process is recovering this worker ledger. Reconcile it before clearing worker-recovery.lock.",
        );
      }
      try {
        let previous, serialized;
        try {
          serialized = fs.readFileSync(file, "utf8");
          previous = JSON.parse(serialized);
        } catch {
          throw new WorkerError(
            "The worker lock is incomplete. Reconcile the ledger before removing worker.lock.",
          );
        }
        if (
          previous.hostname !== os.hostname() ||
          !Number.isSafeInteger(previous.pid) ||
          previous.pid < 1
        )
          throw new WorkerError(
            "The worker ledger is locked by another host. Use one signer service per ledger.",
          );
        try {
          process.kill(previous.pid, 0);
          throw new WorkerError(
            "Another recurring investment worker is using this ledger.",
          );
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
        if (fs.readFileSync(file, "utf8") !== serialized)
          throw new WorkerError(
            "The worker lock changed during recovery. Retry once the other process has stopped.",
          );
        fs.unlinkSync(file);
        // Acquire while holding the recovery guard; another normal acquisition may win,
        // but no second stale-lock remover can unlink that new process's lock.
        try {
          descriptor = fs.openSync(file, "wx", 0o600);
        } catch {
          throw new WorkerError(
            "Another recurring investment worker acquired this ledger during recovery.",
          );
        }
        break;
      } finally {
        fs.closeSync(recovery);
        fs.unlinkSync(recoveryFile);
      }
    }
  }
  if (descriptor === undefined)
    throw new WorkerError(
      "Could not acquire the recurring investment worker lock.",
    );
  fs.writeFileSync(descriptor, value);
  fs.fsyncSync(descriptor);
  fs.closeSync(descriptor);
  return () => {
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === value)
      fs.unlinkSync(file);
  };
}

function updateOutcome(ledger, entry, outcome) {
  if (
    !outcome ||
    !["prepared", "pending", "success", "failed"].includes(outcome.status)
  )
    throw new WorkerError(
      "The executor returned an invalid confirmation state.",
    );
  if (outcome.signature && outcome.signature !== entry.signature)
    throw new WorkerError(
      "The executor returned a different transaction signature. Manual reconciliation is required.",
    );
  if (outcome.status === "success" || outcome.status === "failed") {
    ledger.write({ ...entry, status: outcome.status, updatedAt: Date.now() });
    return true;
  }
  return false;
}

/** Injectable boundary keeps crash/retry tests independent of keys, RPCs and real funds. */
async function runWorkerCycle({
  api,
  ledger,
  signOrder,
  buyer,
  log = console.log,
  now = Date.now,
}) {
  const blockedPlans = new Set();
  for (const entry of ledger.pending()) {
    blockedPlans.add(entry.planId);
    try {
      const outcome = await api({
        action: "reconcile",
        planId: entry.planId,
        runId: entry.runId,
      });
      if (updateOutcome(ledger, entry, outcome)) {
        blockedPlans.delete(entry.planId);
        log(`Investment ${outcome.status}: ${entry.signature}`);
      } else if (outcome.status === "prepared" || entry.expiresAt > now()) {
        // Only identical signed bytes may be retried. The server persists intent before broadcasting.
        const recorded = await api({
          action: "record",
          planId: entry.planId,
          runId: entry.runId,
          signedTransaction: entry.signedTransaction,
          authorization: entry.authorization,
        });
        if (updateOutcome(ledger, entry, recorded))
          blockedPlans.delete(entry.planId);
      }
    } catch {
      log(
        `Investment confirmation is unresolved for run ${entry.runId}; no replacement transaction will be created.`,
      );
    }
  }
  for (const entry of ledger.pending()) blockedPlans.add(entry.planId);
  const { runs } = await api();
  if (!Array.isArray(runs) || runs.length > 1000)
    throw new WorkerError("The executor returned an invalid due-run list.");
  for (const run of runs.slice(0, 20)) {
    if (!validId(run?.planId) || !validId(run?.runId))
      throw new WorkerError("The executor returned an invalid run identity.");
    if (blockedPlans.has(run.planId) || ledger.read(run.planId, run.runId))
      continue;
    try {
      const order = await api({
        action: "prepare",
        planId: run.planId,
        runId: run.runId,
      });
      if (
        order.planId !== run.planId ||
        order.runId !== run.runId ||
        order.taker !== buyer ||
        order.transactionVersion !== 1 ||
        !Number.isFinite(order.expiresAt)
      )
        throw new WorkerError(
          "The executor returned an incompatible or expired investment order.",
        );
      if (order.expiresAt <= now()) {
        const outcome = await api({
          action: "discard",
          planId: run.planId,
          runId: run.runId,
          authorization: order.authorization,
        });
        if (outcome.status !== "failed")
          throw new WorkerError(
            "The expired investment order could not be safely discarded.",
          );
        ledger.write({
          planId: run.planId,
          runId: run.runId,
          status: "failed",
          createdAt: now(),
          reason: "The unsigned order expired before signing.",
        });
        log(
          `The unsigned investment order expired for run ${run.runId}; no transaction was submitted.`,
        );
        continue;
      }
      const { signedTransaction, signature } = await signOrder(order);
      const entry = {
        planId: run.planId,
        runId: run.runId,
        status: "pending",
        signedTransaction,
        signature,
        authorization: order.authorization,
        expiresAt: order.expiresAt,
        lastValidBlockHeight: order.lastValidBlockHeight,
        createdAt: now(),
      };
      // This fsync must finish before any call capable of broadcasting the signed transaction.
      ledger.write(entry);
      blockedPlans.add(run.planId);
      const outcome = await api({
        action: "record",
        planId: run.planId,
        runId: run.runId,
        signedTransaction,
        authorization: order.authorization,
      });
      updateOutcome(ledger, entry, outcome);
      log(`Investment ${outcome.status}: ${signature}`);
    } catch {
      log(
        `Investment run ${run.runId} could not finish. Its transaction status will be checked before another attempt.`,
      );
    }
  }
}

function createExecutorApi(baseUrl, secret) {
  const base = new URL(baseUrl);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
      ))
  )
    throw new WorkerError(
      "Use an HTTPS KITE_WEB_API_URL; HTTP is allowed only on localhost.",
    );
  if (typeof secret !== "string" || secret.length < 32)
    throw new WorkerError(
      "Configure a server-only KITE_RECURRING_EXECUTOR_SECRET of at least 32 characters.",
    );
  const endpoint = new URL("/api/investing/executor", base);
  return async (body) => {
    const response = await fetch(endpoint, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
      redirect: "error",
    });
    if (!response.ok)
      throw new WorkerError(
        `The executor request failed with HTTP ${response.status}.`,
      );
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new WorkerError(
        "The executor did not return JSON. Check KITE_WEB_API_URL.",
      );
    const text = await response.text();
    if (text.length > 512_000)
      throw new WorkerError("The executor response exceeded its size limit.");
    return JSON.parse(text);
  };
}

async function loadSigner(keyFile) {
  const metadata = fs.statSync(keyFile);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0)
    throw new WorkerError(
      "Keep the buyer keypair in a private file with mode 0600.",
    );
  const bytes = JSON.parse(fs.readFileSync(keyFile, "utf8"));
  if (
    !Array.isArray(bytes) ||
    bytes.length !== 64 ||
    bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  )
    throw new WorkerError(
      "The buyer keypair must contain 64 secret-key bytes.",
    );
  const sdkRequire = createRequire(
    path.resolve(__dirname, "../packages/sdk/package.json"),
  );
  const kit = sdkRequire("@solana/kit-v1");
  const keyPair = await kit.createKeyPairFromBytes(Uint8Array.from(bytes));
  bytes.fill(0);
  const buyer = await kit.getAddressFromPublicKey(keyPair.publicKey);
  return {
    buyer,
    async signOrder(order) {
      if (
        typeof order.transaction !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(order.transaction)
      )
        throw new WorkerError(
          "The investment order has invalid transaction bytes.",
        );
      const unsigned = Buffer.from(order.transaction, "base64");
      if (unsigned.length > 4096)
        throw new WorkerError(
          "The investment order exceeds the V1 size limit.",
        );
      const transaction = kit.getTransactionDecoder().decode(unsigned);
      const message = kit
        .getCompiledTransactionMessageDecoder()
        .decode(transaction.messageBytes);
      const signers = Object.keys(transaction.signatures);
      if (
        message.version !== 1 ||
        signers.length !== 1 ||
        signers[0] !== buyer ||
        order.taker !== buyer
      )
        throw new WorkerError(
          "The investment must be V1 with the authorized buyer as its only signer.",
        );
      const signed = await kit.signTransaction([keyPair], transaction);
      const signedTransaction = Buffer.from(
        kit.getTransactionEncoder().encode(signed),
      ).toString("base64");
      const signature = kit.getBase58Decoder().decode(signed.signatures[buyer]);
      return { signedTransaction, signature };
    },
  };
}

async function main() {
  const {
    KITE_WEB_API_URL,
    KITE_RECURRING_EXECUTOR_SECRET,
    KITE_BUYER_KEYPAIR_PATH,
  } = process.env;
  if (!KITE_WEB_API_URL || !KITE_BUYER_KEYPAIR_PATH)
    throw new WorkerError(
      "Configure KITE_WEB_API_URL, KITE_RECURRING_EXECUTOR_SECRET and KITE_BUYER_KEYPAIR_PATH on buyer-controlled infrastructure.",
    );
  const api = createExecutorApi(
    KITE_WEB_API_URL,
    KITE_RECURRING_EXECUTOR_SECRET,
  );
  const signer = await loadSigner(KITE_BUYER_KEYPAIR_PATH);
  const ledger = createLedger(
    process.env.KITE_RECURRING_WORKER_STATE_DIR || ".kite-investment-worker",
  );
  const release = acquireWorkerLock(ledger.root);
  let stopped = false;
  let wake;
  const stop = () => {
    stopped = true;
    wake?.();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    do {
      try {
        await runWorkerCycle({ api, ledger, ...signer });
      } catch (error) {
        if (!process.argv.includes("--watch")) throw error;
        console.error(
          "The executor is temporarily unavailable. Pending investments will be reconciled on the next cycle.",
        );
      }
      if (process.argv.includes("--watch") && !stopped)
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 30_000);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
    } while (process.argv.includes("--watch") && !stopped);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    release();
  }
}

if (require.main === module)
  main().catch((error) => {
    // RPC and HTTP errors can contain credentials; print only messages constructed here.
    console.error(
      error instanceof WorkerError
        ? error.message
        : "Recurring investment worker stopped. Check configuration and reconcile the private ledger before restarting.",
    );
    process.exitCode = 1;
  });

module.exports = {
  createLedger,
  acquireWorkerLock,
  runWorkerCycle,
  createExecutorApi,
  loadSigner,
};
