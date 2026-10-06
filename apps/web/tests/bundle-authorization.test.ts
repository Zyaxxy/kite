import test from "node:test";
import { createPrivateKey, sign } from "node:crypto";
import { composeV1Transaction, inspectWalletTransaction } from "@kite/sdk";
import * as kit from "../../../packages/sdk/node_modules/@solana/kit-v1";
import assert from "node:assert/strict";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  authorizeBundle,
  authorizeBundleStatus,
  verifyBundle,
  verifyBundleStatus,
} from "../lib/server/bundle-authorization";

const signer = Keypair.fromSeed(new Uint8Array(32).fill(1));
const recipient = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;
const blockhash = Keypair.fromSeed(
  new Uint8Array(32).fill(3),
).publicKey.toBase58();
function build(amount: number, signed: boolean): string {
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: signer.publicKey,
          toPubkey: recipient,
          lamports: amount,
        }),
      ],
    }).compileToV0Message(),
  );
  if (signed) tx.sign([signer]);
  return Buffer.from(tx.serialize()).toString("base64");
}
async function buildV1(amount: number, signed = false, memoBytes = 0) {
  const result = await composeV1Transaction({
    payer: signer.publicKey.toBase58(),
    blockhash,
    lastValidBlockHeight: 100,
    allowV1: true,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: recipient,
        lamports: amount,
      }),
      ...(memoBytes
        ? [
            new TransactionInstruction({
              programId: new PublicKey(
                "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
              ),
              keys: [],
              data: Buffer.alloc(memoBytes, 65),
            }),
          ]
        : []),
    ],
  });
  if (!signed) return result.transaction;
  const { transaction } = await inspectWalletTransaction(result.transaction);
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      signer.secretKey.subarray(0, 32),
    ]),
    type: "pkcs8",
    format: "der",
  });
  const signature = sign(null, Buffer.from(transaction.messageBytes), key);
  return Buffer.from(
    kit.getTransactionEncoder().encode({
      ...transaction,
      signatures: {
        [kit.address(signer.publicKey.toBase58())]:
          signature as unknown as kit.SignatureBytes,
      },
    }),
  ).toString("base64");
}
const metadata = {
  taker: signer.publicKey.toBase58(),
  expiresAt: Date.now() + 60000,
  lastValidBlockHeight: 100,
  basketId: "creator-0123456789abcdef01234567",
  inputMint: recipient.toBase58(),
  inAmount: "12345678901234567",
};

test("bundle authorization binds count, ordering, wallet, amount and every signed message", async () => {
  const previous = process.env.KITE_TRADE_SECRET;
  process.env.KITE_TRADE_SECRET =
    "bundle-unit-test-secret-not-a-production-key";
  try {
    const { authorization } = await authorizeBundle({
      ...metadata,
      transactions: [build(1, false), build(2, false)],
    });
    const payload = await verifyBundle(authorization, [
      build(1, true),
      build(2, true),
    ]);
    assert.equal(payload.inAmount, metadata.inAmount);
    await assert.rejects(
      () => verifyBundle(authorization, [build(2, true), build(1, true)]),
      /differs/,
    );
    await assert.rejects(
      () => verifyBundle(authorization, [build(1, true)]),
      /Every reviewed/,
    );
    await assert.rejects(
      () => verifyBundle(authorization, [build(1, true), build(3, true)]),
      /differs/,
    );
    await assert.rejects(
      () => verifyBundle(authorization, [build(1, false), build(2, false)]),
      /valid wallet signature/,
    );
    const [encoded, mac] = authorization.split(".");
    const changed = {
      ...JSON.parse(Buffer.from(encoded, "base64url").toString()),
      inAmount: "9999",
    };
    await assert.rejects(
      () =>
        verifyBundle(
          Buffer.from(JSON.stringify(changed)).toString("base64url") +
            "." +
            mac,
          [build(1, true), build(2, true)],
        ),
      /Invalid bundle authorization/,
    );
  } finally {
    if (previous === undefined) delete process.env.KITE_TRADE_SECRET;
    else process.env.KITE_TRADE_SECRET = previous;
  }
});

test("expired quotes, duplicate messages and substitution of status capabilities fail closed", async () => {
  const previous = process.env.KITE_TRADE_SECRET;
  process.env.KITE_TRADE_SECRET =
    "bundle-unit-test-secret-not-a-production-key";
  try {
    await assert.rejects(
      () =>
        authorizeBundle({
          ...metadata,
          transactions: [build(1, false), build(1, false)],
        }),
      /Duplicate/,
    );
    const { authorization } = await authorizeBundle({
      ...metadata,
      expiresAt: 1,
      transactions: [build(1, false), build(2, false)],
    });
    await assert.rejects(
      () => verifyBundle(authorization, [build(1, true), build(2, true)]),
      /expired/,
    );
    const bundleId = "a".repeat(64);
    const status = authorizeBundleStatus({
      ...metadata,
      signatures: ["receipt1", "receipt2"],
      bundleId,
    });
    assert.equal(verifyBundleStatus(status, bundleId).bundleId, bundleId);
    assert.throws(
      () => verifyBundleStatus(status, "b".repeat(64)),
      /Invalid bundle receipt/,
    );
    await assert.rejects(
      () => verifyBundle(status, [build(1, true), build(2, true)]),
      /Every reviewed/,
    );
  } finally {
    if (previous === undefined) delete process.env.KITE_TRADE_SECRET;
    else process.env.KITE_TRADE_SECRET = previous;
  }
});

test("five V1 messages remain ordered, signed and version-bound; mixed and six-message bundles reject", async () => {
  const prior = process.env.KITE_TRADE_SECRET;
  process.env.KITE_TRADE_SECRET =
    "bundle-unit-test-secret-not-a-production-key";
  try {
    const transactions = await Promise.all(
      [1, 2, 3, 4, 5].map((amount) => buildV1(amount, false, 1300)),
    );
    const signed = await Promise.all(
      [1, 2, 3, 4, 5].map((amount) => buildV1(amount, true, 1300)),
    );
    assert.ok(Buffer.from(transactions[0], "base64").length > 1232);
    const { authorization } = await authorizeBundle({
      ...metadata,
      transactions,
    });
    assert.equal(
      (await verifyBundle(authorization, signed)).transactionVersion,
      1,
    );
    await assert.rejects(
      verifyBundle(authorization, [...signed].reverse()),
      /differs/,
    );
    await assert.rejects(
      verifyBundle(authorization, [build(1, true), ...signed.slice(1)]),
      /version/,
    );
    await assert.rejects(
      authorizeBundle({
        ...metadata,
        transactions: [build(1, false), transactions[0]],
      }),
      /same reviewed version/,
    );
    await assert.rejects(
      authorizeBundle({
        ...metadata,
        transactions: [...transactions, await buildV1(6)],
      }),
      /two to five/,
    );
  } finally {
    if (prior === undefined) delete process.env.KITE_TRADE_SECRET;
    else process.env.KITE_TRADE_SECRET = prior;
  }
});
