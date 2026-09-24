import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../app/api/baskets/performance/route.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

const mockBasket = {
  id: "sol-ai-infra",
  name: "Intelligence Layer",
  ticker: "SOL-AI",
  assets: [
    { asset: { mint: "NVDA_MINT", symbol: "NVDA", priceUsd: 120, change24hPct: 4.5 }, weight: 5000 },
    { asset: { mint: "MSFT_MINT", symbol: "MSFT", priceUsd: 400, change24hPct: -1.5 }, weight: 5000 },
  ],
};

function route({ baskets = [mockBasket], status = "live" } = {}) {
  const exports = {};
  const dependencies = {
    "next/server": require("next/server"),
    "@/lib/server/markets": {
      getServerMarketCatalog: async () => ({
        baskets,
        assets: [],
        status,
      }),
    },
    "@/lib/server/redis": {
      getRedisBasketPerformance: async () => null,
      setRedisBasketPerformance: async () => {},
    },
    "@kite/sdk": {
      calculateBasket24hGrowth: (basket, amount) => ({
        basketId: basket.id,
        timeframe: "24h",
        changePct: 1.5,
        gainLossUsd: 15.0,
        endValueUsd: 1015.0,
        baseAmountUsd: amount,
        asOf: new Date().toISOString(),
        constituents: [],
        topGainer: null,
        topLoser: null,
        history: [],
        status: "live",
        sources: ["Jupiter Token Observations"],
        warnings: [],
      }),
      fetchBasketHistoricalPerformance: async ({ basket, timeframe, baseAmountUsd }) => ({
        basketId: basket.id,
        timeframe,
        changePct: 8.5,
        gainLossUsd: 85.0,
        endValueUsd: 1085.0,
        baseAmountUsd,
        asOf: new Date().toISOString(),
        constituents: [],
        topGainer: null,
        topLoser: null,
        history: [],
        status: "live",
        sources: ["Yahoo Finance Daily Closes"],
        warnings: [],
      }),
    },
  };

  runInNewContext(compiled, {
    require: (id) => dependencies[id] ?? require(id),
    exports,
    module: { exports },
    console,
    process,
    URL,
  });

  return exports;
}

test("performance route returns 400 when basket ID is missing", async () => {
  const handler = route();
  const res = await handler.GET(new Request("https://kite.test/api/baskets/performance"));
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /Provide a valid basket identifier/i);
});

test("performance route returns 404 when basket is not in catalog", async () => {
  const handler = route({ baskets: [] });
  const res = await handler.GET(
    new Request("https://kite.test/api/baskets/performance?id=unknown-basket"),
  );
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.match(data.error, /not found/i);
});

test("performance route returns 30d performance by default with default amount", async () => {
  const handler = route();
  const res = await handler.GET(
    new Request("https://kite.test/api/baskets/performance?id=sol-ai-infra"),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, max-age=120, stale-while-revalidate=600");
  const data = await res.json();
  assert.equal(data.basketId, "sol-ai-infra");
  assert.equal(data.timeframe, "30d");
  assert.equal(data.changePct, 8.5);
  assert.equal(data.gainLossUsd, 85.0);
  assert.equal(data.baseAmountUsd, 1000);
});

test("performance route supports 24h timeframe when requested", async () => {
  const handler = route();
  const res = await handler.GET(
    new Request("https://kite.test/api/baskets/performance?id=sol-ai-infra&timeframe=24h"),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, max-age=120, stale-while-revalidate=600");
  const data = await res.json();
  assert.equal(data.timeframe, "24h");
  assert.equal(data.changePct, 1.5);
  assert.equal(data.gainLossUsd, 15.0);
});

test("performance route supports 30d historical timeframe with custom amount", async () => {
  const handler = route();
  const res = await handler.GET(
    new Request("https://kite.test/api/baskets/performance?id=sol-ai-infra&timeframe=30d&amount=2500"),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.timeframe, "30d");
  assert.equal(data.changePct, 8.5);
  assert.equal(data.baseAmountUsd, 2500);
});
