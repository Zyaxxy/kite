import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair } from "@solana/web3.js";

const require = createRequire(import.meta.url);
const sdk = require("../../../packages/sdk/dist/index.js");
const compiled = ts.transpileModule(
  readFileSync(new URL("../app/api/tokens/route.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const mint = Keypair.generate().publicKey.toBase58();
const issuerAsset = {
  mint,
  symbol: "TESTx",
  name: "Test issuer asset",
  decimals: 8,
  tradingHalted: true,
  verified: true,
  priceUsd: null,
  logoUrl: null,
};

function createRoute({
  discoveryFails = false,
  backpackDiscovery = false,
} = {}) {
  const calls = [];
  const marketCalls = { catalog: 0, prices: 0 };
  const exports = {};
  const dependencies = {
    "next/server": require("next/server"),
    "@kite/sdk": sdk,
    "@/lib/server/markets": {
      getServerMarketCatalog: async () => {
        marketCalls.catalog++;
        return {
          assets: backpackDiscovery ? [] : [issuerAsset],
          backpackSecurities: backpackDiscovery
            ? [
                {
                  solanaMint: mint,
                  symbol: "TEST.US",
                  name: "Backpack test security",
                  decimals: 6,
                  discoveryOnly: true,
                },
              ]
            : undefined,
        };
      },
      getServerMarkets: async () => {
        marketCalls.prices++;
        throw new Error("Token identity must not wait for prices");
      },
    },
    "@/lib/server/swap-tokens": {
      searchJupiterSwapTokens: async (query) => {
        calls.push(query);
        if (discoveryFails) throw new Error("unavailable");
        return [
          {
            ...issuerAsset,
            name: "Untrusted index alias",
            source: "jupiter",
            tradingHalted: false,
            verified: false,
            priceUsd: 123,
          },
        ];
      },
    },
  };
  runInNewContext(compiled, { exports, require: (name) => dependencies[name] });
  return {
    calls,
    marketCalls,
    search: (query) =>
      exports.GET({
        nextUrl: new URL(
          `http://localhost/api/tokens?${new URLSearchParams({ query })}`,
        ),
      }),
  };
}

test("token identity search reads only the issuer catalog, without starting global pricing", async () => {
  const route = createRoute();
  assert.equal((await route.search(issuerAsset.symbol)).status, 200);
  assert.equal(route.marketCalls.catalog, 1);
  assert.equal(route.marketCalls.prices, 0);
});

test("issuer identity and halt state override token-index aliases for the same mint", async () => {
  const route = createRoute();
  const response = await route.search("Untrusted index alias");
  assert.equal(response.status, 200);
  const { tokens } = await response.json();
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].name, issuerAsset.name);
  assert.equal(tokens[0].source, "issuer");
  assert.equal(tokens[0].tradingHalted, true);
  assert.equal(tokens[0].priceUsd, null);
});

test("provider outages return an explicit limited-search state without invented prices", async () => {
  const route = createRoute({ discoveryFails: true });
  const response = await route.search("");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.warning, /temporarily limited/);
  assert.equal(data.tokens.length, 4);
  assert.ok(data.tokens.every((token) => token.priceUsd === null));
});

test("oversized searches are rejected before querying token providers", async () => {
  const route = createRoute();
  const response = await route.search("x".repeat(101));
  assert.equal(response.status, 400);
  assert.equal(route.calls.length, 0);
});

test("a generic token index cannot enable a discovery-only Backpack security", async () => {
  const route = createRoute({ backpackDiscovery: true });
  const data = await (await route.search(mint)).json();
  assert.equal(data.tokens[0].symbol, "TEST.US");
  assert.equal(data.tokens[0].tradingHalted, true);
  assert.equal(data.tokens[0].priceUsd, null);
  assert.equal(data.tokens[0].source, "issuer");
});
