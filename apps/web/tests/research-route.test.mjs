import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../app/api/research/route.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const mint = "11111111111111111111111111111111";
const asset = {
  mint,
  symbol: "NVDAx",
  underlyingSymbol: "NVDA",
  verified: true,
  issuer: "xstocks",
  priceUsd: null,
};

function route({ assets = [asset], status = "live" } = {}) {
  const calls = { catalog: 0, prices: 0, research: [], after: [] };
  const exports = {};
  const dependencies = {
    "next/server": {
      ...require("next/server"),
      after: (callback) => calls.after.push(callback),
    },
    "@/lib/server/markets": {
      getServerMarketCatalog: async () => {
        calls.catalog++;
        return { assets, status };
      },
      getServerMarkets: async () => {
        calls.prices++;
        throw new Error("Research must not wait for prices");
      },
    },
    "@kite/sdk": {
      getStockResearch: async (selected, options) => {
        calls.research.push(selected);
        options.waitUntil(Promise.resolve());
        return {
          mint: selected.mint,
          status: "partial",
          fundamentals: [],
          refreshing: true,
        };
      },
    },
  };
  runInNewContext(compiled, { exports, require: (name) => dependencies[name] });
  return {
    calls,
    get: (value = mint) =>
      exports.GET({
        nextUrl: new URL(`http://localhost/api/research?mint=${value}`),
      }),
  };
}

test("research starts from issuer identity without waiting for the market price universe", async () => {
  const service = route();
  const response = await service.get();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mint, mint);
  assert.equal(service.calls.catalog, 1);
  assert.equal(service.calls.prices, 0);
  assert.equal(service.calls.research[0], asset);
  assert.equal(service.calls.research[0].priceUsd, null);
  assert.equal(service.calls.after.length, 1);
  await service.calls.after[0]();
});

test("research preserves input and catalog validation without querying a price provider", async () => {
  const invalid = route();
  assert.equal((await invalid.get("invalid")).status, 400);
  assert.equal(invalid.calls.catalog, 0);
  for (const [status, expected] of [
    ["live", 404],
    ["unavailable", 503],
  ]) {
    const missing = route({ assets: [], status });
    assert.equal((await missing.get()).status, expected);
    assert.equal(missing.calls.research.length, 0);
    assert.equal(missing.calls.prices, 0);
  }
});
