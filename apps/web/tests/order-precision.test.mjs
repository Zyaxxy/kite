import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair } from "@solana/web3.js";

const require = createRequire(import.meta.url);
const sdk = require("../../../packages/sdk/dist/index.js");
const source = readFileSync(
  new URL("../app/api/trade/order/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const mint = Keypair.generate().publicKey.toBase58();
const wallet = Keypair.generate().publicKey.toBase58();

// Only the upstream dependencies are stubbed. The actual route validation runs unchanged.
function createRoute({
  metadataDecimals = null,
  chainDecimals = 8,
  rpcFails = false,
} = {}) {
  const calls = { precision: [], quotes: [] };
  const exports = {};
  const dependencies = {
    "next/server": require("next/server"),
    "@solana/web3.js": require("@solana/web3.js"),
    "@kite/sdk": sdk,
    "@/lib/server/markets": {
      getServerMarkets: async () => ({
        assets: [
          {
            mint,
            symbol: "TESTx",
            verified: true,
            tradingHalted: false,
            decimals: metadataDecimals,
          },
        ],
      }),
    },
    "@/lib/server/mint-precision": {
      getTradeMintDecimals: async (address) => {
        calls.precision.push(address);
        if (rpcFails) throw new Error("RPC unavailable");
        return chainDecimals;
      },
    },
    "@/lib/server/trade-authorization": {
      authorizeTrade: () => "test-authorization",
    },
  };
  runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected route dependency: ${name}`);
      return dependencies[name];
    },
    process: { env: { JUPITER_API_KEY: "test-only-api-key" } },
    console: { warn: () => {} },
    URLSearchParams,
    AbortSignal,
    Error,
    fetch: async (input) => {
      const params = new URL(input).searchParams;
      calls.quotes.push(params);
      return Response.json({
        requestId: "test-order",
        transaction: "test-unsigned-transaction",
        inputMint: params.get("inputMint"),
        outputMint: params.get("outputMint"),
        inAmount: params.get("amount"),
        outAmount: "100000000",
        slippageBps: 50,
        feeBps: 0,
        router: "test-only-router",
      });
    },
  });
  return {
    calls,
    order: (side, amount) =>
      exports.POST(
        new Request("http://localhost/api/trade/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mint, taker: wallet, side, amount }),
        }),
      ),
  };
}

test("buy and sell quotes recover when market metadata has no decimals", async () => {
  for (const side of ["buy", "sell"]) {
    const route = createRoute();
    const response = await route.order(side, "1.25");
    assert.equal(response.status, 200);
    const order = await response.json();
    assert.deepEqual(route.calls.precision, [mint]);
    assert.equal(order.inputDecimals, side === "buy" ? 6 : 8);
    assert.equal(order.outputDecimals, side === "buy" ? 8 : 6);
    assert.equal(order.inAmount, side === "buy" ? "1250000" : "125000000");
    assert.equal(route.calls.quotes.length, 1);
  }
});

test("mint precision overrides stale metadata and rejects amounts beyond the actual precision", async () => {
  const route = createRoute({ metadataDecimals: 6, chainDecimals: 8 });
  const response = await route.order("sell", "0.00000001");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).inAmount, "1");
  const tooPrecise = await route.order("sell", "0.000000001");
  assert.equal(tooPrecise.status, 400);
  assert.match((await tooPrecise.json()).error, /8 decimal places/);
  assert.equal(route.calls.quotes.length, 1);
});

test("unverified mint precision fails closed before requesting a swap quote", async () => {
  const route = createRoute({ metadataDecimals: 8, rpcFails: true });
  const response = await route.order("buy", "1");
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /RPC configuration/);
  assert.equal(route.calls.quotes.length, 0);
});
