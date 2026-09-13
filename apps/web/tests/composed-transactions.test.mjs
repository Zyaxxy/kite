import test from "node:test";
import { createPrivateKey, createHash, createHmac, sign } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sdk = require("../../../packages/sdk/dist/index.js");
const kit = require("../../../packages/sdk/node_modules/@solana/kit-v1");
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
  assertMainnetV1Ready,
  MAINNET_GENESIS,
} from "../lib/server/composed-transactions.ts";

async function fixture(expiresAt = Date.now() + 60000) {
  const owner = Keypair.generate();
  const built = await sdk.composeMainnetTransaction({
    payer: owner.publicKey.toBase58(),
    blockhash: Keypair.generate().publicKey.toBase58(),
    lastValidBlockHeight: 100,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    ],
    allowV1: true,
  });
  const transaction = (await sdk.inspectWalletTransaction(built.transaction))
    .transaction;
  const order = await authorizeComposed({
    ...built,
    taker: owner.publicKey.toBase58(),
    expiresAt,
    lastValidBlockHeight: 100,
  });
  return { owner, transaction, order };
}
function signedBytes(transaction, owner) {
  const privateKey = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(owner.secretKey.subarray(0, 32)),
    ]),
    format: "der",
    type: "pkcs8",
  });
  const signature = sign(
    null,
    Buffer.from(transaction.messageBytes),
    privateKey,
  );
  return Buffer.from(
    kit
      .getTransactionEncoder()
      .encode({
        ...transaction,
        signatures: { [owner.publicKey.toBase58()]: signature },
      }),
  ).toString("base64");
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
    const signed = signedBytes(transaction, owner);
    assert.equal(
      (await verifyComposed(order.authorization, signed)).version,
      1,
    );
    await assert.rejects(
      verifyComposed(order.authorization + "bad", signed),
      /authorization/,
    );
    const different = await fixture();
    await assert.rejects(
      verifyComposed(
        order.authorization,
        signedBytes(different.transaction, different.owner),
      ),
      /differs/,
    );
    const expired = await fixture(Date.now() - 1);
    await assert.rejects(
      verifyComposed(
        expired.order.authorization,
        signedBytes(expired.transaction, expired.owner),
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

test("new orders require both wallet V1 signing and activated mainnet", async () => {
  const fetch = globalThis.fetch;
  let genesis = MAINNET_GENESIS,
    active = true;
  let calls = 0;
  globalThis.fetch = async (_, init) => {
    calls++;
    const { method } = JSON.parse(init.body);
    const bytes = Buffer.alloc(9);
    bytes[0] = active ? 1 : 0;
    bytes.writeBigUInt64LE(10n, 1);
    return Response.json({
      result:
        method === "getGenesisHash"
          ? genesis
          : method === "getSlot"
            ? 20
            : {
                value: {
                  owner: "Feature111111111111111111111111111111111111",
                  data: [bytes.toString("base64"), "base64"],
                },
              },
    });
  };
  try {
    await assert.rejects(assertMainnetV1Ready([0]), /wallet/);
    assert.equal(calls, 0);
    await assertMainnetV1Ready([1]);
    active = false;
    await assert.rejects(assertMainnetV1Ready([1]), /activation/);
    genesis = Keypair.generate().publicKey.toBase58();
    await assert.rejects(assertMainnetV1Ready([1]), /mainnet/);
  } finally {
    globalThis.fetch = fetch;
  }
});
test("old v0 authorizations can still be verified but cannot be newly issued", async () => {
  const prior = process.env.KITE_TRADE_SECRET;
  process.env.KITE_TRADE_SECRET = "test-only-composed-authorization-secret";
  try {
    const owner = Keypair.generate();
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: owner.publicKey,
        recentBlockhash: Keypair.generate().publicKey.toBase58(),
        instructions: [],
      }).compileToV0Message(),
    );
    const unsigned = Buffer.from(tx.serialize()).toString("base64");
    await assert.rejects(
      authorizeComposed({
        transaction: unsigned,
        transactionVersion: 0,
        taker: owner.publicKey.toBase58(),
        expiresAt: Date.now() + 60000,
        serializedBytes: tx.serialize().length,
        lastValidBlockHeight: 100,
      }),
      /require V1/,
    );
    const payload = Buffer.from(
      JSON.stringify({
        kind: "kite-composed-v1",
        requestId: "old-test-order",
        taker: owner.publicKey.toBase58(),
        expiresAt: Date.now() + 60000,
        messageHash: createHash("sha256")
          .update(tx.message.serialize())
          .digest("hex"),
        lastValidBlockHeight: 100,
      }),
    ).toString("base64url");
    const authorization =
      payload +
      "." +
      createHmac("sha256", process.env.KITE_TRADE_SECRET)
        .update(payload)
        .digest("base64url");
    tx.sign([owner]);
    assert.equal(
      (
        await verifyComposed(
          authorization,
          Buffer.from(tx.serialize()).toString("base64"),
        )
      ).version,
      0,
    );
  } finally {
    if (prior === undefined) delete process.env.KITE_TRADE_SECRET;
    else process.env.KITE_TRADE_SECRET = prior;
  }
});
