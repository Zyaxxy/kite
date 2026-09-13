import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair } from "@solana/web3.js";
import { readLimitedJson } from "../lib/server/request-policy.ts";

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
  simulationStatus = "passed",
  supportsV1 = true,
  tradeSecret = "test-only-trade-secret-with-32-characters",
} = {}) {
  const calls = {
    precision: [],
    quotes: [],
    discovery: [],
    catalog: 0,
    prices: 0,
    simulations: 0,
  };
  const exports = {};
  const dependencies = {
    "next/server": require("next/server"),
    "@solana/web3.js": require("@solana/web3.js"),
    "@kite/sdk": sdk,
    "@/lib/server/markets": {
      getServerMarketCatalog: async () => {
        calls.catalog++;
        return {
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
        };
      },
      getServerMarkets: async () => {
        calls.prices++;
        throw new Error("Trade identity must not wait for prices");
      },
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
    "@/lib/server/composed-transactions": {
      assertMainnetV1Ready: async (versions) => {
        if (!versions.includes(1))
          throw new Error("This wallet does not advertise V1 signing.");
      },
    },
    "@/lib/server/request-policy": { readLimitedJson },
    "@/lib/server/basket-order": {
      prepareTokenSwapOrder: async (input, outputToken) => {
        calls.quotes.push(input);
        calls.simulations++;
        if (simulationStatus !== "passed")
          throw new Error("Simulation unavailable or failed.");
        return {
          transactionVersion: 1,
          requestId: "test-order",
          transaction: "test-unsigned-transaction",
          authorization: "test-authorization",
          serializedBytes: 400,
          lastValidBlockHeight: 100,
          expiresAt: Date.now() + 45000,
          slippageBps: input.slippageBps,
          outputs: [
            {
              outAmount: "100000000",
              minimumAmount: "99000000",
              symbol: outputToken.symbol,
            },
          ],
        };
      },
    },
  };
  runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected route dependency: ${name}`);
      return dependencies[name];
    },
    process: {
      env: {
        JUPITER_API_KEY: "test-only-api-key",
        KITE_TRADE_SECRET: tradeSecret,
      },
    },
    console: { warn: () => {} },
    URLSearchParams,
    AbortSignal,
    Error,
  });
  return {
    calls,
    order: (side, amount) =>
      exports.POST(
        new Request("http://localhost/api/trade/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mint,
            taker: wallet,
            side,
            amount,
            supportedTransactionVersions: supportsV1 ? [1] : [0],
          }),
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
            supportedTransactionVersions: supportsV1 ? [1] : [0],
          }),
        }),
      ),
  };
}

test("trade identity validation obtains a quote without requesting global market prices", async () => {
  const route = createRoute();
  const response = await route.swap(mint, secondMint);
  assert.equal(response.status, 200);
  assert.equal(route.calls.catalog, 1);
  assert.equal(route.calls.prices, 0);
  assert.equal(route.calls.quotes.length, 1);
});

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

test("a failed or unavailable preflight never produces a signable order", async () => {
  for (const [simulationStatus, status] of [
    ["failed", 400],
    ["unavailable", 400],
  ]) {
    const route = createRoute({ simulationStatus });
    const response = await route.swap(mint, secondMint);
    assert.equal(response.status, status);
    const result = await response.json();
    assert.equal(result.transaction, undefined);
    assert.equal(route.calls.simulations, 1);
  }
  const response = await createRoute().swap(mint, secondMint);
  assert.equal((await response.json()).simulation.status, "passed");
});

test("new swaps use capped V1 composition and unsupported wallets fail before routing", async () => {
  const route = createRoute();
  const order = await (await route.swap(mint, secondMint)).json();
  assert.equal(route.calls.quotes[0].slippageBps, 100);
  assert.equal(order.transactionVersion, 1);
  assert.equal(order.otherAmountThreshold, "99000000");
  const incompatible = createRoute({ supportsV1: false });
  assert.equal((await incompatible.swap(mint, secondMint)).status, 400);
  assert.equal(incompatible.calls.quotes.length, 0);
  assert.equal(incompatible.calls.catalog, 0);
  const missingSecret = createRoute({ tradeSecret: "" });
  assert.equal((await missingSecret.swap(mint, secondMint)).status, 503);
  assert.equal(missingSecret.calls.quotes.length, 0);
});
