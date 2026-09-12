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

function createRoute({ discoveryFails = false } = {}) {
  const calls = [];
  const exports = {};
  const dependencies = {
    "next/server": require("next/server"),
    "@kite/sdk": sdk,
    "@/lib/server/markets": {
      getServerMarkets: async () => ({ assets: [issuerAsset] }),
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
    search: (query) =>
      exports.GET({
        nextUrl: new URL(
          `http://localhost/api/tokens?${new URLSearchParams({ query })}`,
        ),
      }),
  };
}

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
