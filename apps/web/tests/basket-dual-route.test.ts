import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sdk from "@kite/sdk";
import * as kit from "../../../packages/sdk/node_modules/@solana/kit-v1";
import {
  Keypair,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import type { composeBasketExecution } from "../lib/server/basket-order";

const require = createRequire(import.meta.url);
const payer = Keypair.generate().publicKey;
const tipAccount = Keypair.generate().publicKey;
const lifetime = {
  blockhash: Keypair.generate().publicKey.toBase58(),
  lastValidBlockHeight: 100,
};

/** Replace only external services; use the real SDK codecs, limits and partitioner. */
function router() {
  let lookupReads = 0,
    tipReads = 0;
  const exports: { composeBasketExecution?: typeof composeBasketExecution } =
    {};
  const source = ts.transpileModule(
    readFileSync(
      new URL("../lib/server/basket-order.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(source, {
    exports,
    Buffer,
    process,
    require: (name: string) => {
      if (name === "@kite/sdk") return sdk;
      if (name === "@solana/web3.js" || name === "@solana/spl-token")
        return require(name);
      if (name === "./jupiter-lookup-tables")
        return {
          loadVerifiedLookupTables: async () => {
            lookupReads++;
            return [];
          },
        };
      if (name === "./jito-bundles")
        return {
          prepareJitoTip: async () => {
            tipReads++;
            return {
              lamports: 1000,
              instruction: SystemProgram.transfer({
                fromPubkey: payer,
                toPubkey: tipAccount,
                lamports: 1000,
              }),
            };
          },
        };
      return {};
    },
  });
  return {
    compose: exports.composeBasketExecution!,
    reads: () => ({ lookupReads, tipReads }),
  };
}

function legs(
  count: number,
  accountsPerLeg = 1,
  dataBytes = 1,
): sdk.BasketSwapLeg[] {
  return Array.from({ length: count }, (_, allocationIndex) => ({
    allocationIndex,
    instructions: [
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: Array.from({ length: accountsPerLeg }, () => ({
          pubkey: Keypair.generate().publicKey,
          isSigner: false,
          isWritable: true,
        })),
        data: Buffer.alloc(dataBytes, allocationIndex),
      }),
    ],
  }));
}
const params = (version: 0 | 1, allocations: sdk.BasketSwapLeg[]) => ({
  transactionVersion: version,
  taker: payer.toBase58(),
  lifetime,
  legs: allocations,
  // Deliberately invalid ALT metadata must never be touched by a V1 build.
  routeLookupTables: [{ ignored: ["not-an-address"] }],
});

test("twelve assets fitting one V1 transaction request neither lookup tables nor Jito tips", async () => {
  const { compose, reads } = router();
  const result = await compose(params(1, legs(12)));
  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0].transactionVersion, 1);
  assert.equal(result.tipLamports, 0);
  assert.deepEqual(reads(), { lookupReads: 0, tipReads: 0 });
});

test("account overflow routes through V1 bundles with only the final reviewed tip and zero ALT reads", async () => {
  const { compose, reads } = router();
  const result = await compose(params(1, legs(10, 20)));
  assert.equal(result.chunks.length, 4);
  assert.ok(
    result.chunks.every(
      (chunk) => chunk.accountCount <= 64 && chunk.serializedBytes <= 4096,
    ),
  );
  assert.equal(result.tipLamports, 1000);
  assert.deepEqual(reads(), { lookupReads: 0, tipReads: 1 });
  const decoded = await Promise.all(
    result.chunks.map((chunk) =>
      sdk.inspectWalletTransaction(chunk.transaction),
    ),
  );
  assert.ok(
    decoded
      .slice(0, -1)
      .every(
        ({ message }) =>
          !message.staticAccounts.includes(tipAccount.toBase58() as never),
      ),
  );
  const final = decoded.at(-1)!.message;
  assert.ok(final.staticAccounts.includes(tipAccount.toBase58() as never));
  assert.deepEqual(
    Array.from(
      kit.decompileTransactionMessage(final).instructions.at(-1)!.data ?? [],
    ),
    Array.from(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: tipAccount,
        lamports: 1000,
      }).data,
    ),
  );
});

test("byte overflow below 64 accounts also partitions, and V0 keeps verified ALT loading", async () => {
  const v1 = router();
  const result = await v1.compose(params(1, legs(4, 1, 1500)));
  assert.equal(result.chunks.length, 2);
  assert.deepEqual(v1.reads(), { lookupReads: 0, tipReads: 1 });
  const v0 = router();
  const legacy = await v0.compose(params(0, legs(2)));
  assert.equal(legacy.chunks.length, 1);
  assert.equal(legacy.chunks[0].transactionVersion, 0);
  assert.deepEqual(v0.reads(), { lookupReads: 1, tipReads: 0 });
});

test("a signer validation error cannot be converted into bundle routing", async () => {
  const { compose, reads } = router();
  const invalid = legs(4);
  invalid[0].instructions[0].keys[0].isSigner = true;
  await assert.rejects(compose(params(1, invalid)), /additional signer/);
  assert.deepEqual(reads(), { lookupReads: 0, tipReads: 0 });
});
