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

const key = () => web3.Keypair.generate().publicKey.toBase58();
const wallet = key();
const inputMint = key();
const mintA = key();
const mintB = key();

test("customAllocations validation in prepareAllocationOrder", async () => {
  const code = readFileSync("apps/web/lib/server/basket-order.ts", "utf8");
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const mockMarket = {
    assets: [
      { mint: inputMint, symbol: "USDC", verified: true, tradingHalted: false },
      { mint: mintA, symbol: "A", verified: true, tradingHalted: false },
      { mint: mintB, symbol: "B", verified: true, tradingHalted: false },
    ],
    baskets: [],
  };

  const exports = {};
  const sandbox = {
    process: { env: { JUPITER_API_KEY: "test-key" } },
    Buffer,
    URLSearchParams,
    require: (mod) => {
      if (mod === "@solana/web3.js") return web3;
      if (mod === "@solana/spl-token") return spl;
      if (mod === "@kite/sdk") return sdk;
      if (mod === "./jupiter-build") return { fetchJupiterBuild: async () => ({ ok: true, json: async () => ({}) }) };
      if (mod === "./markets") return { getServerMarketCatalog: async () => mockMarket };
      if (mod === "./mint-precision") return { getTradeMintDecimals: async () => 6 };
      if (mod === "./composed-transactions") {
        return {
          assertMainnetV1Ready: async () => {},
          authorizeComposed: async (o) => o,
          latestBlockhash: async () => ({ blockhash: "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM", lastValidBlockHeight: 100 }),
          mainnetRpc: async () => ({ value: [] }),
          simulateComposed: async () => ({ accounts: [] }),
        };
      }
      return require(mod);
    },
    exports,
    module: { exports },
  };

  runInNewContext(transpiled, sandbox);
  const { prepareBasketOrder } = exports;

  // Rejects 1 allocation
  await assert.rejects(
    () =>
      prepareBasketOrder({
        basketId: "custom",
        inputMint,
        amount: "100",
        taker: wallet,
        slippageBps: 100,
        customAllocations: [{ mint: mintA, weightBps: 10000 }],
      }),
    /between 2 and 4 assets/,
  );

  // Rejects 5 allocations
  await assert.rejects(
    () =>
      prepareBasketOrder({
        basketId: "custom",
        inputMint,
        amount: "100",
        taker: wallet,
        slippageBps: 100,
        customAllocations: [
          { mint: key(), weightBps: 2000 },
          { mint: key(), weightBps: 2000 },
          { mint: key(), weightBps: 2000 },
          { mint: key(), weightBps: 2000 },
          { mint: key(), weightBps: 2000 },
        ],
      }),
    /between 2 and 4 assets/,
  );

  // Rejects weight sum not 10000
  await assert.rejects(
    () =>
      prepareBasketOrder({
        basketId: "custom",
        inputMint,
        amount: "100",
        taker: wallet,
        slippageBps: 100,
        customAllocations: [
          { mint: mintA, weightBps: 4000 },
          { mint: mintB, weightBps: 5000 },
        ],
      }),
    /must total exactly 10,000 basis points/,
  );

  // Rejects unverified / missing asset
  await assert.rejects(
    () =>
      prepareBasketOrder({
        basketId: "custom",
        inputMint,
        amount: "100",
        taker: wallet,
        slippageBps: 100,
        customAllocations: [
          { mint: mintA, weightBps: 5000 },
          { mint: key(), weightBps: 5000 }, // not in mockMarket.assets
        ],
      }),
    /unavailable or halted/,
  );
});
