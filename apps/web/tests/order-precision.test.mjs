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
const secondMint = Keypair.generate().publicKey.toBase58();
const arbitraryMint = Keypair.generate().publicKey.toBase58();

// Only the upstream dependencies are stubbed. The actual route validation runs unchanged.
function createRoute({
  metadataDecimals = null,
  chainDecimals = 8,
  rpcFails = false,
  haltedMint = null,
  unknownToken = false,
  incompleteCatalog = false,
} = {}) {
  const calls = { precision: [], quotes: [], discovery: [] };
  const exports = {};
  const dependencies = {
    "next/server": require("next/server"),
    "@solana/web3.js": require("@solana/web3.js"),
    "@kite/sdk": sdk,
    "@/lib/server/markets": {
      getServerMarkets: async () => ({
        status: "live",
        sources: incompleteCatalog
          ? []
          : ["xStocks issuer catalog", "PreStocks issuer catalog"],
        assets: [
          {
            mint,
            symbol: "TESTx",
            verified: true,
            tradingHalted: haltedMint === mint,
            decimals: metadataDecimals,
          },
          {
            mint: secondMint,
            symbol: "SECONDx",
            name: "Second test asset",
            verified: true,
            tradingHalted: haltedMint === secondMint,
            decimals: 6,
          },
        ],
      }),
    },
    "@/lib/server/swap-tokens": {
      searchJupiterSwapTokens: async (query) => {
        calls.discovery.push(query);
        return unknownToken
          ? []
          : [
              {
                mint: arbitraryMint,
                symbol: "TEST",
                name: "Test token",
                decimals: 4,
                source: "jupiter",
                verified: false,
                priceUsd: null,
                tradingHalted: false,
              },
            ];
      },
    },
    "@/lib/server/mint-precision": {
      getTradeMintDecimals: async (address) => {
        calls.precision.push(address);
        if (rpcFails) throw new Error("RPC unavailable");
        return address === sdk.MAINNET_USDC_MINT ||
          address === sdk.MAINNET_USDT_MINT
          ? 6
          : address === sdk.MAINNET_SOL_MINT
            ? 9
            : address === arbitraryMint
              ? 4
              : address === secondMint
                ? 2
                : chainDecimals;
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
    swap: (inputMint, outputMint, amount = "1.25") =>
      exports.POST(
        new Request("http://localhost/api/trade/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputMint,
            outputMint,
            amount,
            taker: wallet,
          }),
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
    assert.deepEqual(
      route.calls.precision,
      side === "buy"
        ? [sdk.MAINNET_USDC_MINT, mint]
        : [mint, sdk.MAINNET_USDC_MINT],
    );
    assert.equal(order.inputDecimals, side === "buy" ? 6 : 8);
    assert.equal(order.outputDecimals, side === "buy" ? 8 : 6);
    assert.equal(order.inAmount, side === "buy" ? "1250000" : "125000000");
    assert.equal(route.calls.quotes.length, 1);
  }
});

test("direct stock-to-stock swaps resolve both mint precisions", async () => {
  const route = createRoute();
  const response = await route.swap(mint, secondMint, "0.00000001");
  assert.equal(response.status, 200);
  const order = await response.json();
  assert.equal(order.side, "swap");
  assert.equal(order.inputDecimals, 8);
  assert.equal(order.outputDecimals, 2);
  assert.equal(order.inAmount, "1");
  assert.equal(order.inputMint, mint);
  assert.equal(order.outputMint, secondMint);
  assert.deepEqual(route.calls.precision, [mint, secondMint]);
});

test("SOL, USDT and indexed arbitrary tokens can fund an issuer asset", async () => {
  for (const input of [
    sdk.MAINNET_SOL_MINT,
    sdk.MAINNET_USDT_MINT,
    arbitraryMint,
  ]) {
    const route = createRoute();
    const response = await route.swap(input, mint);
    assert.equal(response.status, 200);
    const order = await response.json();
    assert.equal(order.inputMint, input);
    assert.equal(
      order.inAmount,
      input === sdk.MAINNET_SOL_MINT
        ? "1250000000"
        : input === sdk.MAINNET_USDT_MINT
          ? "1250000"
          : "12500",
    );
    assert.deepEqual(
      route.calls.discovery,
      input === arbitraryMint ? [arbitraryMint] : [],
    );
  }
});

test("arbitrary token output uses server-discovered identity and chain precision", async () => {
  const route = createRoute();
  const response = await route.swap(mint, arbitraryMint);
  assert.equal(response.status, 200);
  const order = await response.json();
  assert.equal(order.outputSymbol, "TEST");
  assert.equal(order.outputDecimals, 4);
});

test("same-mint, unknown token and halted assets cannot request routes", async () => {
  const same = createRoute();
  assert.equal((await same.swap(mint, mint)).status, 400);
  assert.equal(same.calls.quotes.length, 0);
  const unknown = createRoute({ unknownToken: true });
  assert.equal((await unknown.swap(arbitraryMint, mint)).status, 422);
  assert.equal(unknown.calls.precision.length, 0);
  for (const haltedMint of [mint, secondMint]) {
    const halted = createRoute({ haltedMint });
    assert.equal((await halted.swap(mint, secondMint)).status, 422);
    assert.equal(halted.calls.quotes.length, 0);
  }
});

test("an incomplete issuer catalog cannot bypass issuer halt checks through token search", async () => {
  const route = createRoute({ incompleteCatalog: true });
  assert.equal(
    (await route.swap(arbitraryMint, sdk.MAINNET_USDC_MINT)).status,
    503,
  );
  assert.equal(route.calls.discovery.length, 0);
  assert.equal(route.calls.quotes.length, 0);
  assert.equal(
    (await route.swap(sdk.MAINNET_SOL_MINT, sdk.MAINNET_USDC_MINT)).status,
    200,
  );
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
