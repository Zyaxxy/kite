import test from "node:test";
import assert from "node:assert/strict";
import {
  AddressLookupTableAccount,
  Keypair,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  composeBasketV0Chunks,
  composeV0Transaction,
} from "../src/basket/bundle";

const key = (seed: number) => {
  const bytes = Buffer.alloc(32);
  bytes.writeUInt32LE(seed);
  return Keypair.fromSeed(bytes).publicKey;
};
const payer = key(1),
  blockhash = key(2).toBase58(),
  program = key(3),
  tipAccount = key(4);
const tip = SystemProgram.transfer({
  fromPubkey: payer,
  toPubkey: tipAccount,
  lamports: 10000,
});
function fixture(count: number, accountsPerLeg = 1, dataBytes = 20) {
  const addresses = Array.from({ length: count * accountsPerLeg }, (_, i) =>
    key(i + 20),
  );
  const table = new AddressLookupTableAccount({
    key: key(10),
    state: {
      deactivationSlot: 18446744073709551615n,
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      addresses,
    },
  });
  const legs = Array.from({ length: count }, (_, i) => ({
    allocationIndex: i,
    instructions: [
      new TransactionInstruction({
        programId: program,
        data: Buffer.alloc(dataBytes, i),
        keys: [
          { pubkey: payer, isSigner: true, isWritable: true },
          ...addresses
            .slice(i * accountsPerLeg, (i + 1) * accountsPerLeg)
            .map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })),
        ],
      }),
    ],
  }));
  return {
    payer: payer.toBase58(),
    blockhash,
    legs,
    lookupTables: [table],
    basketAssetCount: count,
    finalTipInstruction: tip,
  };
}

test("small baskets compile to a single actual v0 transaction, without a Jito tip", () => {
  const options = fixture(3);
  const chunks = composeBasketV0Chunks(options);
  assert.equal(chunks.length, 1);
  const tx = VersionedTransaction.deserialize(
    Buffer.from(chunks[0].transaction, "base64"),
  );
  assert.equal(tx.version, 0);
  assert.ok(chunks[0].serializedBytes <= 1232);
  const message = TransactionMessage.decompile(tx.message, {
    addressLookupTableAccounts: options.lookupTables,
  });
  assert.equal(
    message.instructions.filter((instruction) =>
      instruction.programId.equals(SystemProgram.programId),
    ).length,
    0,
  );
});

test("five assets partition to two ordered transactions with the tip only on the final swap", () => {
  const options = fixture(5, 14);
  const chunks = composeBasketV0Chunks(options);
  assert.equal(chunks.length, 2);
  assert.deepEqual(
    chunks.flatMap((chunk) => chunk.allocationIndexes),
    [0, 1, 2, 3, 4],
  );
  for (const [index, chunk] of chunks.entries()) {
    const tx = VersionedTransaction.deserialize(
      Buffer.from(chunk.transaction, "base64"),
    );
    const message = TransactionMessage.decompile(tx.message, {
      addressLookupTableAccounts: options.lookupTables,
    });
    const tips = message.instructions.filter((ix) =>
      ix.programId.equals(SystemProgram.programId),
    );
    assert.equal(tips.length, index === 1 ? 1 : 0);
    if (tips.length) {
      assert.ok(message.instructions.at(-1)!.keys[1].pubkey.equals(tipAccount));
      assert.equal(tips[0].data.readBigUInt64LE(4), 10000n);
      assert.ok(
        tx.message.staticAccountKeys.some((address) =>
          address.equals(tipAccount),
        ),
      );
    }
  }
});

test("ALTs compress wire bytes but five 24-account routes still require three chunks", () => {
  const options = fixture(5, 24);
  const chunks = composeBasketV0Chunks(options);
  assert.equal(chunks.length, 3);
  assert.ok(
    chunks.every(
      (chunk) => chunk.accountCount <= 64 && chunk.serializedBytes <= 1232,
    ),
  );
  assert.throws(
    () =>
      composeV0Transaction({
        ...options,
        instructions: options.legs.flatMap((leg) => leg.instructions),
      }),
    /64-account/,
  );
});

test("capacity failure never emits a truncated basket and a split requires a reviewed tip", () => {
  assert.throws(
    () => composeBasketV0Chunks(fixture(11, 24)),
    /cannot fit within five/,
  );
  const simple = fixture(2, 1, 800);
  assert.throws(
    () => composeBasketV0Chunks({ ...simple, finalTipInstruction: undefined }),
    /1232-byte/,
  );
  assert.equal(composeBasketV0Chunks(simple).length, 2);
});

test("tip cannot be loaded from an ALT, and an extra route signer fails closed", () => {
  const options = fixture(5, 14);
  options.lookupTables[0].state.addresses.push(tipAccount);
  assert.throws(
    () => composeBasketV0Chunks(options),
    /tip accounts must remain static/,
  );
  const other = fixture(1);
  other.legs[0].instructions[0].keys.push({
    pubkey: key(8),
    isSigner: true,
    isWritable: false,
  });
  assert.throws(() => composeBasketV0Chunks(other), /additional signer/);
});

test("twelve fitting allocations stay single; nine account-heavy legs may use all five chunks", () => {
  assert.equal(composeBasketV0Chunks(fixture(12)).length, 1);
  const five = composeBasketV0Chunks(fixture(9, 24));
  assert.equal(five.length, 5);
  assert.deepEqual(
    five.flatMap((chunk) => chunk.allocationIndexes),
    Array.from({ length: 9 }, (_, i) => i),
  );
});
