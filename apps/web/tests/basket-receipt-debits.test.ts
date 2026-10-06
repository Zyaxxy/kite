import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as web3 from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { MAINNET_USDC_MINT } from "@kite/sdk";

const taker = web3.Keypair.generate().publicKey.toBase58();
const source = spl
  .getAssociatedTokenAddressSync(
    new web3.PublicKey(MAINNET_USDC_MINT),
    new web3.PublicKey(taker),
  )
  .toBase58();
const reviewed = {
  basketId: `creator-${"a".repeat(24)}`,
  inputMint: MAINNET_USDC_MINT,
  inAmount: "20000",
};
const code = ts.transpileModule(
  readFileSync("apps/web/lib/server/basket-receipts.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function chainReceipt(signature: string, debit: number, slot = 100) {
  const balance = (amount: number) => ({
    accountIndex: 1,
    owner: taker,
    mint: MAINNET_USDC_MINT,
    uiTokenAmount: { amount: String(amount), decimals: 6 },
  });
  return {
    slot,
    transaction: {
      signatures: [signature],
      message: { accountKeys: [taker, source] },
    },
    meta: {
      err: null as unknown,
      preTokenBalances: [balance(30_000)],
      postTokenBalances: [balance(30_000 - debit)],
      loadedAddresses: { writable: [] as string[], readonly: [] as string[] },
    },
  };
}

function fixture(receipts: Record<string, unknown>, mainnet = true) {
  const recorded: { amountBaseUnits: string; signature: string }[] = [];
  const calls: string[] = [];
  const exports = {} as typeof import("../lib/server/basket-receipts");
  const dependencies: Record<string, unknown> = {
    "@kite/sdk": { MAINNET_USDC_MINT },
    "@solana/web3.js": web3,
    "@solana/spl-token": spl,
    "./creator-store": {
      recordCreatorVolume: async (value: (typeof recorded)[number]) => {
        recorded.push(value);
      },
    },
    "./composed-transactions": {
      assertMainnet: async () => {
        if (!mainnet) throw new Error("Mainnet required");
      },
      mainnetRpc: async (method: string, params: unknown[]) => {
        assert.equal(method, "getTransaction");
        calls.push(params[0] as string);
        assert.equal(
          (params[1] as { commitment: string }).commitment,
          "confirmed",
        );
        return receipts[params[0] as string] ?? null;
      },
    },
  };
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(name in dependencies, name);
      return dependencies[name];
    },
    console: { warn: () => {} },
  });
  return { record: exports.recordConfirmedBasketReceipt, recorded, calls };
}

for (const debit of [19_999, 19_989]) {
  test(`creator volume uses the confirmed ${debit} debit rather than the 20,000 budget`, async () => {
    const run = fixture({ first: chainReceipt("first", debit) });
    await run.record(reviewed, taker, "first");
    assert.equal(run.recorded.length, 1);
    assert.equal(run.recorded[0].amountBaseUnits, String(debit));
  });
}

test("bundle volume sums every signature and retains the first signature as the deduplication key", async () => {
  const run = fixture({
    first: chainReceipt("first", 9999),
    second: chainReceipt("second", 9999),
  });
  await run.record(reviewed, taker, "first", ["first", "second"]);
  assert.deepEqual(run.calls, ["first", "second"]);
  assert.equal(run.recorded[0].amountBaseUnits, "19998");
  assert.equal(run.recorded[0].signature, "first");
});

test("new authorization permits confirmed spending only up to its signed upper budget", async () => {
  const authorization = { ...reviewed, inAmount: "20050" };
  const accepted = fixture({ first: chainReceipt("first", 20_050) });
  await accepted.record(authorization, taker, "first");
  assert.equal(accepted.recorded[0].amountBaseUnits, "20050");
  const rejected = fixture({ first: chainReceipt("first", 20_051) });
  await rejected.record(authorization, taker, "first");
  assert.equal(rejected.recorded.length, 0);
});

test("V0 receipts can locate the funding ATA in loaded addresses", async () => {
  const receipt = chainReceipt("first", 19_999);
  receipt.transaction.message.accountKeys = [taker];
  receipt.meta.loadedAddresses.writable = [source];
  const run = fixture({ first: receipt });
  await run.record(reviewed, taker, "first");
  assert.equal(run.recorded[0].amountBaseUnits, "19999");
});

test("invalid or unavailable receipts never fall back to the nominal budget", async () => {
  const invalid = [
    null,
    { ...chainReceipt("first", 20_000), meta: null },
    chainReceipt("wrong-signature", 20_000),
    chainReceipt("first", 20_001),
    chainReceipt("first", 0),
  ];
  const failed = chainReceipt("first", 20_000);
  failed.meta.err = { InstructionError: [1, "Custom"] };
  invalid.push(failed);
  const missingBalances = chainReceipt("first", 20_000);
  missingBalances.meta.postTokenBalances = [];
  invalid.push(missingBalances);
  const wrongOwner = chainReceipt("first", 20_000);
  wrongOwner.meta.postTokenBalances[0].owner =
    web3.Keypair.generate().publicKey.toBase58();
  invalid.push(wrongOwner);
  for (const receipt of invalid) {
    const run = fixture({ first: receipt });
    await run.record(reviewed, taker, "first");
    assert.equal(run.recorded.length, 0);
  }
});

test("mixed-slot and incomplete bundles award no volume", async () => {
  for (const second of [null, chainReceipt("second", 9999, 101)]) {
    const run = fixture({ first: chainReceipt("first", 9999), second });
    await run.record(reviewed, taker, "first", ["first", "second"]);
    assert.equal(run.recorded.length, 0);
  }
});

test("invalid signature sets and wrong-network RPCs fail closed", async () => {
  for (const signatures of [[], ["first", "first"], ["second"]]) {
    const run = fixture({ first: chainReceipt("first", 20_000) });
    await run.record(reviewed, taker, "first", signatures);
    assert.equal(run.recorded.length, 0);
    assert.equal(run.calls.length, 0);
  }
  const run = fixture({ first: chainReceipt("first", 20_000) }, false);
  await run.record(reviewed, taker, "first");
  assert.equal(run.recorded.length, 0);
  assert.equal(run.calls.length, 0);
});

test("non-creator and non-USDC receipts need no analytics RPC read", async () => {
  const run = fixture({});
  await run.record(
    { ...reviewed, basketId: "sol-digital-leaders" },
    taker,
    "first",
  );
  await run.record(
    { ...reviewed, inputMint: "devnet-test-mint" },
    taker,
    "first",
  );
  assert.equal(run.calls.length, 0);
  assert.equal(run.recorded.length, 0);
});
