import assert from "node:assert/strict";
import test from "node:test";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  composeBasketV0Chunks,
  composeV0Transaction,
  isTransactionCapacityError,
} from "../src/basket/bundle";

const key = (seed: number) => {
  const bytes = Buffer.alloc(32);
  bytes.writeUInt32LE(seed);
  return Keypair.fromSeed(bytes).publicKey;
};
const payer = key(1);
const blockhash = key(2).toBase58();
const program = key(3);
const tipAccount = key(4);
const table = (seed: number, addresses: PublicKey[]) =>
  new AddressLookupTableAccount({
    key: key(seed),
    state: {
      deactivationSlot: (1n << 64n) - 1n,
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      addresses,
    },
  });
const instruction = (addresses: PublicKey[], bytes = 20) =>
  new TransactionInstruction({
    programId: program,
    keys: addresses.map((pubkey, index) => ({
      pubkey,
      isWritable: index % 2 === 0,
      isSigner: false,
    })),
    data: Buffer.alloc(bytes, 7),
  });
const normalize = (ix: TransactionInstruction) => ({
  program: ix.programId.toBase58(),
  keys: ix.keys.map(({ pubkey, isSigner, isWritable }) => ({
    address: pubkey.toBase58(),
    isSigner,
    isWritable,
  })),
  data: ix.data.toString("hex"),
});
function originalBytes(
  instructions: TransactionInstruction[],
  lookupTables: AddressLookupTableAccount[],
) {
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 7142 }),
        ...instructions,
      ],
    }).compileToV0Message(lookupTables),
  ).serialize().length;
}
function decompile(
  transaction: string,
  lookupTables: AddressLookupTableAccount[],
) {
  const decoded = VersionedTransaction.deserialize(
    Buffer.from(transaction, "base64"),
  );
  assert.equal(decoded.message.version, 0);
  const message = TransactionMessage.decompile(decoded.message, {
    addressLookupTableAccounts: lookupTables,
  });
  return { decoded, message };
}

test("overlapping lookup tables cannot force a false V0 byte-limit failure", () => {
  const accounts = Array.from({ length: 20 }, (_, index) => key(index + 100));
  const fragmented = accounts
    .slice(0, 16)
    .map((address, index) => table(index + 500, [address]));
  const covering = table(600, accounts);
  const lookupTables = [...fragmented, covering];
  const swap = instruction(accounts, 450);
  const baseline = originalBytes([swap], lookupTables);
  assert.ok(baseline > 1232);
  const result = composeV0Transaction({
    payer: payer.toBase58(),
    blockhash,
    instructions: [swap],
    lookupTables,
  });
  assert.ok(result.serializedBytes < baseline);
  assert.ok(result.serializedBytes <= 1232);
  assert.equal(result.accountCount, 23);
  const { message } = decompile(result.transaction, lookupTables);
  assert.deepEqual(message.instructions.slice(2).map(normalize), [
    normalize(swap),
  ]);
});

test("packing retains the baseline and avoids one-key lookup overhead", () => {
  const accounts = Array.from({ length: 10 }, (_, index) => key(index + 700));
  const cases = [
    [table(800, [accounts[0]])],
    [table(801, accounts)],
    [table(802, accounts.slice(0, 6)), table(803, accounts.slice(3))],
    [table(804, accounts.slice(3)), table(805, accounts.slice(0, 6))],
  ];
  const swap = instruction(accounts);
  for (const lookupTables of cases) {
    const result = composeV0Transaction({
      payer: payer.toBase58(),
      blockhash,
      instructions: [swap],
      lookupTables,
    });
    assert.ok(result.serializedBytes <= originalBytes([swap], lookupTables));
    const { message } = decompile(result.transaction, lookupTables);
    assert.deepEqual(message.instructions.slice(2).map(normalize), [
      normalize(swap),
    ]);
  }
  const single = composeV0Transaction({
    payer: payer.toBase58(),
    blockhash,
    instructions: [swap],
    lookupTables: cases[0],
  });
  assert.equal(
    decompile(single.transaction, cases[0]).decoded.message.addressTableLookups
      .length,
    0,
  );
});

test("Jito tips remain static while original lookup indexes and instruction roles are preserved", () => {
  const accounts = Array.from({ length: 64 }, (_, index) => key(index + 1000));
  const legs = [
    { allocationIndex: 0, instructions: [instruction(accounts.slice(0, 32))] },
    { allocationIndex: 1, instructions: [instruction(accounts.slice(32))] },
  ];
  const tip = SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: tipAccount,
    lamports: 1000,
  });
  for (const tipIndex of [0, 17, 64]) {
    const addresses = [...accounts];
    addresses.splice(tipIndex, 0, tipAccount);
    const lookupTables = [table(1200 + tipIndex, addresses)];
    const initialAddresses = addresses.map((address) => address.toBase58());
    const chunks = composeBasketV0Chunks({
      payer: payer.toBase58(),
      blockhash,
      legs,
      lookupTables,
      finalTipInstruction: tip,
    });
    assert.equal(chunks.length, 2);
    for (const [index, chunk] of chunks.entries()) {
      assert.ok(chunk.serializedBytes <= 1232);
      assert.ok(chunk.accountCount <= 64);
      const { decoded, message } = decompile(chunk.transaction, lookupTables);
      const expected = [
        ...legs[index].instructions,
        ...(index === 1 ? [tip] : []),
      ];
      assert.deepEqual(
        message.instructions.slice(2).map(normalize),
        expected.map(normalize),
      );
      for (const lookup of decoded.message.addressTableLookups) {
        assert.ok(!lookup.writableIndexes.includes(tipIndex));
        assert.ok(!lookup.readonlyIndexes.includes(tipIndex));
      }
      const staticIndex = decoded.message.staticAccountKeys.findIndex(
        (address) => address.equals(tipAccount),
      );
      if (index === 1) {
        assert.ok(staticIndex >= 0);
        assert.equal(decoded.message.isAccountWritable(staticIndex), true);
        assert.equal(decoded.message.isAccountSigner(staticIndex), false);
        assert.deepEqual(
          normalize(message.instructions.at(-1)!),
          normalize(tip),
        );
      } else assert.equal(staticIndex, -1);
    }
    assert.deepEqual(
      lookupTables[0].state.addresses.map((address) => address.toBase58()),
      initialAddresses,
    );
  }
});

test("promoting both writable and read-only keys preserves the static account header", () => {
  const accounts = Array.from({ length: 12 }, (_, index) => key(index + 1400));
  const lookupTables = [table(1500, accounts)];
  const swap = instruction(accounts);
  const result = composeV0Transaction({
    payer: payer.toBase58(),
    blockhash,
    instructions: [swap],
    lookupTables,
    staticAccountKeys: accounts.slice(0, 2),
  });
  const { decoded, message } = decompile(result.transaction, lookupTables);
  assert.ok(decoded.message.addressTableLookups.length > 0);
  for (const [offset, account] of accounts.slice(0, 2).entries()) {
    const index = decoded.message.staticAccountKeys.findIndex((key) =>
      key.equals(account),
    );
    assert.ok(index >= 0);
    assert.equal(decoded.message.isAccountWritable(index), offset === 0);
    assert.equal(decoded.message.isAccountSigner(index), false);
  }
  assert.deepEqual(message.instructions.slice(2).map(normalize), [
    normalize(swap),
  ]);
});

test("packing never relaxes signer, byte or runtime-account validation", () => {
  const additionalSigner = instruction([key(1600)]);
  additionalSigner.keys[0].isSigner = true;
  assert.throws(
    () =>
      composeV0Transaction({
        payer: payer.toBase58(),
        blockhash,
        instructions: [additionalSigner],
      }),
    (error: unknown) =>
      error instanceof Error &&
      /additional signer/.test(error.message) &&
      !isTransactionCapacityError(error),
  );
  assert.throws(
    () =>
      composeV0Transaction({
        payer: payer.toBase58(),
        blockhash,
        instructions: [instruction([], 1500)],
      }),
    (error: unknown) =>
      isTransactionCapacityError(error) && error.limit === "bytes",
  );
  const accounts = Array.from({ length: 64 }, (_, index) => key(index + 1700));
  assert.throws(
    () =>
      composeV0Transaction({
        payer: payer.toBase58(),
        blockhash,
        instructions: [instruction(accounts)],
        lookupTables: [table(1800, accounts)],
      }),
    (error: unknown) =>
      isTransactionCapacityError(error) && error.limit === "accounts",
  );
});
