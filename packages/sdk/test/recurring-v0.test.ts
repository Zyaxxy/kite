import test from "node:test";
import assert from "node:assert/strict";
import {
  Keypair,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { composeDevnetV0Transaction } from "../src/guard/devnet";
import {
  DEVNET_RECURRING_BASKETS,
  createUnprovisionedDevnetManifest,
  resolveDevnetBasketAssets,
} from "../src/devnet-xstocks";

const payer = Keypair.generate().publicKey;
const lifetime = {
  payer: payer.toBase58(),
  blockhash: Keypair.generate().publicKey.toBase58(),
};
test("devnet V0 composition preserves sole owner fee payer and never adds ALTs", () => {
  const result = composeDevnetV0Transaction({
    ...lifetime,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    ],
  });
  const decoded = VersionedTransaction.deserialize(
    Buffer.from(result.transaction, "base64"),
  );
  assert.equal(decoded.version, 0);
  assert.equal(decoded.message.header.numRequiredSignatures, 1);
  assert.equal(
    decoded.message.staticAccountKeys[0].toBase58(),
    payer.toBase58(),
  );
  assert.equal(decoded.message.addressTableLookups.length, 0);
  assert.ok(result.serializedBytes <= 1232);
});
test("devnet V0 rejects oversized setup and unexpected signers before requesting approval", () => {
  assert.throws(
    () =>
      composeDevnetV0Transaction({
        ...lifetime,
        instructions: [
          new TransactionInstruction({
            programId: SystemProgram.programId,
            keys: [],
            data: Buffer.alloc(1300),
          }),
        ],
      }),
    /size limit/,
  );
  assert.throws(
    () =>
      composeDevnetV0Transaction({
        ...lifetime,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: Keypair.generate().publicKey,
            toPubkey: payer,
            lamports: 1,
          }),
        ],
      }),
    /one reviewed/,
  );
  assert.throws(
    () =>
      composeDevnetV0Transaction({
        ...lifetime,
        instructions: [
          new TransactionInstruction({
            programId: SystemProgram.programId,
            keys: Array.from({ length: 65 }, () => ({
              pubkey: Keypair.generate().publicKey,
              isSigner: false,
              isWritable: true,
            })),
            data: Buffer.alloc(0),
          }),
        ],
      }),
    /64-account/,
  );
});

test("focused landing basket links use their canonical symbols and fail closed until test mints are provisioned", () => {
  const expected = {
    "sol-digital-leaders": ["AAPL", "MSFT", "NVDA"],
    "sol-ai-focused": ["NVDA", "GOOGL", "AMZN"],
    "sol-everyday-focused": ["AAPL", "AMZN", "KO"],
  };
  for (const [id, symbols] of Object.entries(expected)) {
    assert.deepEqual(
      DEVNET_RECURRING_BASKETS.find((basket) => basket.id === id)
        ?.underlyingSymbols,
      symbols,
    );
    assert.throws(
      () => resolveDevnetBasketAssets(createUnprovisionedDevnetManifest(), id),
      /not provisioned/,
    );
  }
  assert.equal(
    new Set(DEVNET_RECURRING_BASKETS.map((basket) => basket.id)).size,
    DEVNET_RECURRING_BASKETS.length,
  );
});
