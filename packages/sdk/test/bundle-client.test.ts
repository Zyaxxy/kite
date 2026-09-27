import test from "node:test";
import assert from "node:assert/strict";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { KiteClient } from "../src/client/kite-client";
import {
  composeV0Transaction,
  type BasketBundleOrder,
} from "../src/basket/bundle";

const wallet = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey;
const recipient = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;
const built = composeV0Transaction({
  payer: wallet.toBase58(),
  blockhash: recipient.toBase58(),
  instructions: [
    SystemProgram.transfer({
      fromPubkey: wallet,
      toPubkey: recipient,
      lamports: 1000,
    }),
  ],
});
const second = composeV0Transaction({
  payer: wallet.toBase58(),
  blockhash: recipient.toBase58(),
  instructions: [
    SystemProgram.transfer({
      fromPubkey: wallet,
      toPubkey: recipient,
      lamports: 1001,
    }),
  ],
});
const request = {
  basketId: "basket",
  inputMint: recipient.toBase58(),
  taker: wallet.toBase58(),
  amount: "2",
  slippageBps: 100,
  supportedTransactionVersions: [0],
};
const bundle: BasketBundleOrder = {
  kind: "bundle",
  basketId: request.basketId,
  inputMint: request.inputMint,
  taker: request.taker,
  inputDecimals: 6,
  inAmount: "2000000",
  slippageBps: 100,
  expiresAt: Date.now() + 60000,
  lastValidBlockHeight: 100,
  transactionVersion: 0,
  tipLamports: 10000,
  transactions: [built.transaction, second.transaction],
  serializedBytes: [built.serializedBytes, second.serializedBytes],
  requestId: "request",
  authorization: "test-proof",
  atomicityWarning: "Partial execution remains possible after skipped blocks.",
  priorityFeeLamports: 20000,
  outputs: ["one", "two"].map((mint) => ({
    mint,
    symbol: mint,
    decimals: 6,
    inputAmount: "1000000",
    outAmount: "100",
    minimumAmount: "99",
    weightBps: 5000,
  })),
};
const json = (data: unknown) => Response.json(data);

test("client accepts the v0 basket union and rejects malformed count, bytes, tip and allocations", async () => {
  assert.equal(
    (
      (await new KiteClient({
        fetcher: async () => json(bundle),
      }).requestBasketOrder(request)) as BasketBundleOrder
    ).kind,
    "bundle",
  );
  for (const patch of [
    { tipLamports: 100001 },
    { transactions: [built.transaction] },
    { serializedBytes: [1233, 1233] },
    { transactions: [built.transaction, built.transaction] },
    { transactionVersion: 1 },
    { outputs: [bundle.outputs[0], bundle.outputs[0]] },
    { inAmount: "3000000" },
  ])
    await assert.rejects(
      new KiteClient({
        fetcher: async () => json({ ...bundle, ...patch }),
      }).requestBasketOrder(request),
      /invalid response/,
    );
});

test("lost send response only queries recovery; a receipt stays Pending until all confirmations", async () => {
  const paths: string[] = [];
  const signatures = ["1".repeat(88), "2".repeat(88)];
  const client = new KiteClient({
    fetcher: async (url) => {
      paths.push(String(url));
      if (String(url).endsWith("/execute"))
        throw new Error("response lost after acceptance");
      return json({
        status: "Pending",
        signatures,
        statusAuthorization: "receipt-proof",
      });
    },
  });
  const result = await client.executeBundle({
    signedTransactions: bundle.transactions,
    authorization: bundle.authorization,
  });
  assert.equal(result.status, "Pending");
  assert.deepEqual(paths, ["/api/bundles/execute", "/api/bundles/status"]);
  assert.equal(result.statusAuthorization, "receipt-proof");
});

test("a success label with missing transaction signatures never becomes confirmed success", async () => {
  const client = new KiteClient({
    fetcher: async () =>
      json({ status: "Success", signatures: [], bundleId: "a".repeat(64) }),
  });
  const result = await client.executeBundle({
    signedTransactions: bundle.transactions,
    authorization: bundle.authorization,
  });
  assert.equal(result.status, "Unknown");
});
