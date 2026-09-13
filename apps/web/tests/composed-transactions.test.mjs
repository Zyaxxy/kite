import test from "node:test";
import assert from "node:assert/strict";
import {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  authorizeComposed,
  verifyComposed,
  mainnetV1Active,
} from "../lib/server/composed-transactions.ts";

async function fixture(expiresAt = Date.now() + 60000) {
  const owner = Keypair.generate();
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey: owner.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
      instructions: [
        SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 1,
        }),
      ],
    }).compileToV0Message(),
  );
  const order = await authorizeComposed({
    taker: owner.publicKey.toBase58(),
    transaction: Buffer.from(transaction.serialize()).toString("base64"),
    transactionVersion: 0,
    serializedBytes: transaction.serialize().length,
    expiresAt,
    lastValidBlockHeight: 100,
  });
  return { owner, transaction, order };
}
test("composed execution binds wallet, message, expiry and server signature", async () => {
  const prior = process.env.KITE_TRADE_SECRET;
  process.env.KITE_TRADE_SECRET = "test-only-composed-authorization-secret";
  try {
    const { owner, transaction, order } = await fixture();
    await assert.rejects(
      verifyComposed(order.authorization, order.transaction),
      /signature/,
    );
    transaction.sign([owner]);
    const signed = Buffer.from(transaction.serialize()).toString("base64");
    assert.equal(
      (await verifyComposed(order.authorization, signed)).version,
      0,
    );
    await assert.rejects(
      verifyComposed(order.authorization + "bad", signed),
      /authorization/,
    );
    transaction.message.recentBlockhash =
      Keypair.generate().publicKey.toBase58();
    transaction.sign([owner]);
    await assert.rejects(
      verifyComposed(
        order.authorization,
        Buffer.from(transaction.serialize()).toString("base64"),
      ),
      /differs/,
    );
    const expired = await fixture(Date.now() - 1);
    expired.transaction.sign([expired.owner]);
    await assert.rejects(
      verifyComposed(
        expired.order.authorization,
        Buffer.from(expired.transaction.serialize()).toString("base64"),
      ),
      /expired/,
    );
  } finally {
    if (prior === undefined) delete process.env.KITE_TRADE_SECRET;
    else process.env.KITE_TRADE_SECRET = prior;
  }
});
test("V1 gating requires a correctly owned, activated feature account", async () => {
  const fetch = globalThis.fetch;
  let owner = "Feature111111111111111111111111111111111111";
  let activeSlot = 10;
  const bytes = Buffer.alloc(9);
  bytes[0] = 1;
  globalThis.fetch = async (_, init) => {
    const { method } = JSON.parse(init.body);
    bytes.writeBigUInt64LE(BigInt(activeSlot), 1);
    return Response.json({
      result:
        method === "getSlot"
          ? 20
          : { value: { owner, data: [bytes.toString("base64"), "base64"] } },
    });
  };
  try {
    assert.equal(await mainnetV1Active(), true);
    activeSlot = 21;
    assert.equal(await mainnetV1Active(), false);
    activeSlot = 10;
    owner = SystemProgram.programId.toBase58();
    assert.equal(await mainnetV1Active(), false);
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    assert.equal(await mainnetV1Active(), false);
  } finally {
    globalThis.fetch = fetch;
  }
});
