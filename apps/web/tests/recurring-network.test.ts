import test from "node:test";
import assert from "node:assert/strict";
import { Keypair, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { composeDevnetV0Transaction, DEVNET_GENESIS_HASH } from "@kite/sdk";
import {
  getDevnetConnection,
  getDevnetRpcUrl,
  recurringRpcTimeout,
  withinRecurringDeadline,
  verifyDevnetConnection,
} from "../lib/server/devnet-connection";
import {
  assertRecurringDevnet,
  authorizeRecurringTransaction,
  executeRecurringTransaction,
  recurringTransactionVersion,
  verifyRecurringTransaction,
} from "../lib/server/recurring-devnet-transport";

test("devnet client is independent of mainnet settings and the RPC deadline is bounded", async () => {
  const previous = {
    mainnet: process.env.SOLANA_RPC_URL,
    recurring: process.env.KITE_RECURRING_RPC_URL,
  };
  process.env.SOLANA_RPC_URL = "https://mainnet.example.invalid";
  delete process.env.KITE_RECURRING_RPC_URL;
  try {
    assert.equal(new URL(getDevnetRpcUrl()).hostname, "api.devnet.solana.com");
    assert.equal(
      new URL(getDevnetConnection().rpcEndpoint).hostname,
      "api.devnet.solana.com",
    );
    process.env.KITE_RECURRING_RPC_URL = "https://devnet.example.invalid";
    assert.equal(new URL(getDevnetRpcUrl()).hostname, "devnet.example.invalid");
    await withinRecurringDeadline(Date.now() + 100, async () => {
      assert.ok(recurringRpcTimeout() <= 100);
    });
    await withinRecurringDeadline(Date.now() + 100, async () => {
      await withinRecurringDeadline(Date.now() + 12000, async () => {
        assert.ok(recurringRpcTimeout() <= 100);
      });
    });
    await assert.rejects(
      () =>
        withinRecurringDeadline(Date.now() - 1, async () =>
          recurringRpcTimeout(),
        ),
      /time limit/,
    );
  } finally {
    if (previous.mainnet === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = previous.mainnet;
    if (previous.recurring === undefined)
      delete process.env.KITE_RECURRING_RPC_URL;
    else process.env.KITE_RECURRING_RPC_URL = previous.recurring;
  }
});

test("devnet connection verification sanitizes provider URLs and enforces its request deadline", async () => {
  const previousFetch = globalThis.fetch;
  const previousRpc = process.env.KITE_RECURRING_RPC_URL;
  process.env.KITE_RECURRING_RPC_URL =
    "https://devnet.example.invalid/?api-key=secret-test-key";
  let observedSignal: AbortSignal | undefined;
  globalThis.fetch = async (_url, options) => {
    observedSignal = options?.signal ?? undefined;
    throw new Error(
      "Provider https://devnet.example.invalid/?api-key=secret-test-key failed",
    );
  };
  try {
    await assert.rejects(
      () =>
        withinRecurringDeadline(Date.now() + 500, () =>
          verifyDevnetConnection(getDevnetConnection()),
        ),
      (error: Error) => {
        assert.equal(error.message, "The recurring devnet RPC is unavailable.");
        assert.doesNotMatch(error.message, /secret-test-key/);
        return true;
      },
    );
    assert.ok(observedSignal instanceof AbortSignal);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousRpc === undefined) delete process.env.KITE_RECURRING_RPC_URL;
    else process.env.KITE_RECURRING_RPC_URL = previousRpc;
  }
});

test("V0 exact-message authorization checks signatures and refuses any non-devnet broadcast", async () => {
  const previousFetch = globalThis.fetch,
    previousSecret = process.env.KITE_RECURRING_AUTH_SECRET;
  process.env.KITE_RECURRING_AUTH_SECRET =
    "only-a-test-secret-for-recurring-authorization";
  const calls: string[] = [];
  const owner = Keypair.generate();
  const unsigned = composeDevnetV0Transaction({
    payer: owner.publicKey.toBase58(),
    blockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    ],
  });
  try {
    const approved = await authorizeRecurringTransaction({
      transaction: unsigned.transaction,
      signer: owner.publicKey.toBase58(),
      plan: Keypair.generate().publicKey.toBase58(),
      operation: "create",
      expiresAt: Date.now() + 45000,
      lastValidBlockHeight: 1000,
    });
    assert.equal(approved.transactionVersion, 0);
    await assert.rejects(
      () =>
        verifyRecurringTransaction(
          approved.authorization,
          unsigned.transaction,
        ),
      /valid wallet signature/,
    );
    const signed = VersionedTransaction.deserialize(
      Buffer.from(unsigned.transaction, "base64"),
    );
    signed.sign([owner]);
    const signedTransaction = Buffer.from(signed.serialize()).toString(
      "base64",
    );
    assert.equal(
      (
        await verifyRecurringTransaction(
          approved.authorization,
          signedTransaction,
        )
      ).transactionVersion,
      0,
    );
    signed.message.recentBlockhash = Keypair.generate().publicKey.toBase58();
    signed.sign([owner]);
    await assert.rejects(
      () =>
        verifyRecurringTransaction(
          approved.authorization,
          Buffer.from(signed.serialize()).toString("base64"),
        ),
      /differs/,
    );
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body)) as { method: string };
      calls.push(body.method);
      return new Response(
        JSON.stringify({
          result: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
        }),
      );
    };
    await assert.rejects(
      () =>
        executeRecurringTransaction({
          authorization: approved.authorization,
          signedTransaction,
        }),
      /restricted to Solana devnet/,
    );
    assert.deepEqual(calls, ["getGenesisHash"]);
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body)) as { method: string };
      calls.push(body.method);
      return new Response(JSON.stringify({ result: DEVNET_GENESIS_HASH }));
    };
    await assertRecurringDevnet();
    assert.equal(await recurringTransactionVersion([0]), 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined)
      delete process.env.KITE_RECURRING_AUTH_SECRET;
    else process.env.KITE_RECURRING_AUTH_SECRET = previousSecret;
  }
});
