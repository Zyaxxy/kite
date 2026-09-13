const test = require("node:test");
const assert = require("node:assert/strict");
const { createPublicKey, verify } = require("node:crypto");
const {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} = require("@solana/web3.js");
const {
  composeMainnetTransaction,
  inspectWalletTransaction,
} = require("../dist");
const {
  featureActive,
  signV1Collection,
} = require("../../../scripts/collect-recurring-payment.cjs");

test("the payment collector only enables V1 after the owned feature activates", () => {
  const data = Buffer.alloc(9);
  data[0] = 1;
  data.writeBigUInt64LE(20n, 1);
  const feature = {
    owner: new PublicKey("Feature111111111111111111111111111111111111"),
    data,
  };
  assert.equal(featureActive(feature, 19), false);
  assert.equal(featureActive(feature, 20), true);
  assert.equal(
    featureActive({ ...feature, owner: SystemProgram.programId }, 20),
    false,
  );
  data[0] = 0;
  assert.equal(featureActive(feature, 20), false);
  assert.equal(featureActive(null, 20), false);
});
test("the collector signs V1 bytes with its buyer key and refuses legacy creation", async () => {
  const buyer = Keypair.generate(),
    blockhash = Keypair.generate().publicKey.toBase58();
  const built = await composeMainnetTransaction({
    payer: buyer.publicKey.toBase58(),
    blockhash,
    lastValidBlockHeight: 100,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: buyer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    ],
    allowV1: true,
  });
  const signed = await signV1Collection(built.transaction, buyer.secretKey);
  const { transaction, message } = await inspectWalletTransaction(signed);
  assert.equal(message.version, 1);
  const publicKey = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      buyer.publicKey.toBuffer(),
    ]),
    type: "spki",
    format: "der",
  });
  assert.equal(
    verify(
      null,
      Buffer.from(transaction.messageBytes),
      publicKey,
      Buffer.from(transaction.signatures[buyer.publicKey.toBase58()]),
    ),
    true,
  );
  const old = new VersionedTransaction(
    new TransactionMessage({
      payerKey: buyer.publicKey,
      recentBlockhash: blockhash,
      instructions: [],
    }).compileToV0Message(),
  );
  await assert.rejects(
    signV1Collection(
      Buffer.from(old.serialize()).toString("base64"),
      buyer.secretKey,
    ),
    /requires a V1/,
  );
});
