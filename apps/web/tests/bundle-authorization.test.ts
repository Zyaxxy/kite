import test from "node:test";
import assert from "node:assert/strict";
import {
  Keypair,
  SystemProgram,
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
const metadata = {
  taker: signer.publicKey.toBase58(),
  expiresAt: Date.now() + 60000,
  lastValidBlockHeight: 100,
  basketId: "creator-0123456789abcdef01234567",
  inputMint: recipient.toBase58(),
  inAmount: "12345678901234567",
};

test("bundle authorization binds count, ordering, wallet, amount and every signed message", () => {
  const previous = process.env.KITE_TRADE_SECRET;
  process.env.KITE_TRADE_SECRET =
    "bundle-unit-test-secret-not-a-production-key";
  try {
    const { authorization } = authorizeBundle({
      ...metadata,
      transactions: [build(1, false), build(2, false)],
    });
    const payload = verifyBundle(authorization, [
      build(1, true),
      build(2, true),
    ]);
    assert.equal(payload.inAmount, metadata.inAmount);
    assert.throws(
      () => verifyBundle(authorization, [build(2, true), build(1, true)]),
      /differs/,
    );
    assert.throws(
      () => verifyBundle(authorization, [build(1, true)]),
      /Every reviewed/,
    );
    assert.throws(
      () => verifyBundle(authorization, [build(1, true), build(3, true)]),
      /differs/,
    );
    assert.throws(
      () => verifyBundle(authorization, [build(1, false), build(2, false)]),
      /valid wallet signature/,
    );
    const [encoded, mac] = authorization.split(".");
    const changed = {
      ...JSON.parse(Buffer.from(encoded, "base64url").toString()),
      inAmount: "9999",
    };
    assert.throws(
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

test("expired quotes, duplicate messages and substitution of status capabilities fail closed", () => {
  const previous = process.env.KITE_TRADE_SECRET;
  process.env.KITE_TRADE_SECRET =
    "bundle-unit-test-secret-not-a-production-key";
  try {
    assert.throws(
      () =>
        authorizeBundle({
          ...metadata,
          transactions: [build(1, false), build(1, false)],
        }),
      /Duplicate/,
    );
    const { authorization } = authorizeBundle({
      ...metadata,
      expiresAt: 1,
      transactions: [build(1, false), build(2, false)],
    });
    assert.throws(
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
    assert.throws(
      () => verifyBundle(status, [build(1, true), build(2, true)]),
      /Every reviewed/,
    );
  } finally {
    if (previous === undefined) delete process.env.KITE_TRADE_SECRET;
    else process.env.KITE_TRADE_SECRET = previous;
  }
});
