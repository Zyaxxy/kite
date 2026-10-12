import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sdk = require("../../../packages/sdk/dist/index.js");
const web3 = require("@solana/web3.js");
const spl = require("@solana/spl-token");
const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/server/basket-order.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const assets = ["AAPL", "MSFT", "NVDA"].map((symbol) => ({
  mint: web3.Keypair.generate().publicKey.toBase58(),
  underlyingSymbol: symbol,
  symbol: `${symbol}x`,
  name: symbol,
  issuer: "xstocks",
  verified: true,
  tradingHalted: false,
  priceUsd: null,
}));

function prepare({ market = {}, inputMint = sdk.MAINNET_USDC_MINT, basketId = "sol-digital-leaders", customAllocations } = {}) {
  const calls = { precision: [], rpc: 0, routes: 0 };
  const exports = {};
  const dependencies = {
    "@kite/sdk": sdk,
    "@solana/web3.js": web3,
    "@solana/spl-token": spl,
    "./markets": { getServerMarketCatalog: async () => ({
      status: "partial",
      sources: ["xStocks issuer catalog"],
      assets,
      // Deliberately old/missing definitions in the persisted catalog.
      baskets: [{ id: "retired-cache-only-basket", assets: [], missingSymbols: [] }],
      backpackSecurities: [],
      ...market,
    }) },
    "./mint-precision": { getTradeMintDecimals: async (mint) => {
      calls.precision.push(mint);
      throw new Error("Reached onchain mint validation");
    } },
    "./jupiter-build": { fetchJupiterBuild: async () => { calls.routes++; } },
    "./creator-store": { resolvePublishedCreatorBasket: async () => null },
    "./bundle-authorization": {},
    "./jito-bundles": {},
    "./jupiter-lookup-tables": {},
    "./composed-transactions": {
      selectMainnetTransactionVersion: async () => 1,
      mainnetRpc: async () => { calls.rpc++; return { value: [] }; },
    },
  };
  runInNewContext(compiled, {
    exports,
    require: (name) => dependencies[name],
    process: { env: { JUPITER_API_KEY: "test-key" } },
    Buffer,
    URLSearchParams,
  });
  return {
    calls,
    order: exports.prepareBasketOrder({
      taker: web3.Keypair.generate().publicKey.toBase58(),
      inputMint,
      basketId,
      amount: "100",
      slippageBps: 100,
      supportedTransactionVersions: [1],
      customAllocations,
    }),
  };
}

test("verified xStocks basket reaches mint validation despite unrelated issuer outages and old cached definitions", async () => {
  const run = prepare();
  await assert.rejects(run.order, /Reached onchain mint validation/);
  assert.deepEqual(run.calls.precision, [sdk.MAINNET_USDC_MINT, ...assets.map((a) => a.mint)]);
});

test("removed cached basket IDs are rejected with a refresh instruction", async () => {
  const run = prepare({ basketId: "retired-cache-only-basket" });
  await assert.rejects(run.order, /no longer in the current catalog.*Refresh/);
  assert.equal(run.calls.rpc, 0);
});

test("missing, unverified and halted members still reject the whole basket before routing", async () => {
  for (const [selected, pattern] of [
    [assets.slice(1), /missing issuer-listed assets: AAPL/],
    [assets.map((a, i) => i === 0 ? { ...a, verified: false } : a), /No partial basket/],
    [assets.map((a, i) => i === 0 ? { ...a, tradingHalted: true } : a), /No partial basket/],
  ]) {
    const run = prepare({ market: { assets: selected } });
    await assert.rejects(run.order, pattern);
    assert.equal(run.calls.precision.length, 0);
    assert.equal(run.calls.routes, 0);
  }
});

test("missing relevant issuer status fails closed for curated and custom allocations", async () => {
  for (const customAllocations of [undefined, assets.slice(0, 2).map((a) => ({ mint: a.mint, weightBps: 5000 }))]) {
    const run = prepare({ market: { sources: ["PreStocks issuer catalog"] }, customAllocations });
    await assert.rejects(run.order, /Issuer trading status for a selected asset/);
    assert.equal(run.calls.rpc, 0);
  }
});

test("the funding asset's issuer and discovery-only Backpack restrictions remain enforced", async () => {
  const funding = { ...assets[0], mint: web3.Keypair.generate().publicKey.toBase58(), issuer: "prestocks" };
  const run = prepare({ inputMint: funding.mint, market: { assets: [...assets, funding] } });
  await assert.rejects(run.order, /Issuer trading status for a selected asset/);
  for (const mint of [sdk.MAINNET_USDC_MINT, assets[0].mint]) {
    const blocked = prepare({ market: { backpackSecurities: [{
      discoveryOnly: true, candidateSolanaMints: [mint],
    }] } });
    await assert.rejects(blocked.order, /discovery-only/);
    assert.equal(blocked.calls.rpc, 0);
  }
});
