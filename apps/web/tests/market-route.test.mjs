import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(new URL("../app/api/markets/route.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function snapshot() {
  return {
    assets: [
      {
        mint: "11111111111111111111111111111111",
        symbol: "NVDAx",
        priceUsd: 120,
        priceSource: "jupiter-tokens-v2",
        priceObservedAt: "2026-09-13T12:00:00Z",
        underlyingPriceUsd: 119,
        underlyingPriceUpdatedAt: "2026-09-12T20:00:00Z",
      },
    ],
    baskets: [],
    asOf: "2026-09-13T12:00:00Z",
    network: "mainnet-beta",
    sources: [
      "xStocks issuer catalog",
      "PreStocks issuer catalog",
      "Jupiter Tokens V2",
    ],
    status: "live",
    warnings: [],
    refreshing: false,
  };
}

function route() {
  let current = snapshot();
  let failure = false;
  const calls = { markets: 0, after: [] };
  const exports = {};
  const dependencies = {
    "next/server": {
      ...require("next/server"),
      after: (callback) => calls.after.push(callback),
    },
    "node:crypto": require("node:crypto"),
    crypto: require("node:crypto"),
    "@/lib/server/markets": {
      getServerMarkets: async (options) => {
        calls.markets++;
        if (failure) throw new Error("Provider transport failed");
        options.waitUntil(Promise.resolve());
        return current;
      },
    },
  };
  runInNewContext(compiled, {
    exports,
    Response,
    Request,
    Headers,
    require: (name) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected route dependency: ${name}`);
      return dependencies[name];
    },
  });
  return {
    calls,
    set: (value) => {
      current = value;
    },
    fail: () => {
      failure = true;
    },
    get: (tag) =>
      exports.GET(
        new Request("http://localhost/api/markets", {
          headers: tag ? { "If-None-Match": tag } : {},
        }),
      ),
  };
}

test("unchanged market polling returns an empty 304 while preserving background refresh scheduling", async () => {
  const service = route();
  const first = await service.get();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), snapshot());
  const tag = first.headers.get("ETag");
  assert.ok(tag, "The initial response has a cache validator");
  const unchanged = await service.get(tag);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");
  assert.equal(unchanged.headers.get("ETag"), tag);
  assert.equal(service.calls.markets, 2);
  assert.equal(service.calls.after.length, 2);
  await Promise.all(service.calls.after.map((callback) => callback()));
});

test("price, source-date, source-list and refresh-state changes always send the updated snapshot", async () => {
  const changes = [
    [
      "token price",
      (value) => ({
        ...value,
        assets: [{ ...value.assets[0], priceUsd: 121 }],
      }),
    ],
    [
      "token observation date",
      (value) => ({
        ...value,
        assets: [
          { ...value.assets[0], priceObservedAt: "2026-09-13T12:00:05Z" },
        ],
      }),
    ],
    [
      "underlying observation date",
      (value) => ({
        ...value,
        assets: [
          {
            ...value.assets[0],
            underlyingPriceUpdatedAt: "2026-09-13T12:00:05Z",
          },
        ],
      }),
    ],
    [
      "snapshot observation date",
      (value) => ({ ...value, asOf: "2026-09-13T12:00:05Z" }),
    ],
    [
      "provider sources",
      (value) => ({
        ...value,
        sources: [...value.sources, "Jupiter Price V3"],
      }),
    ],
    ["refresh begins", (value) => ({ ...value, refreshing: true })],
    [
      "warning state",
      (value) => ({
        ...value,
        status: "partial",
        warnings: ["A price provider is unavailable."],
      }),
    ],
  ];
  for (const [label, change] of changes) {
    const service = route();
    const first = await service.get();
    const oldTag = first.headers.get("ETag");
    const updated = change(snapshot());
    service.set(updated);
    const response = await service.get(oldTag);
    assert.equal(response.status, 200, label);
    assert.notEqual(response.headers.get("ETag"), oldTag, label);
    assert.deepEqual(await response.json(), updated, label);
  }
});

test("finishing a refresh sends its completion even when prices and source dates stay the same", async () => {
  const service = route();
  service.set({ ...snapshot(), refreshing: true });
  const loading = await service.get();
  service.set(snapshot());
  const complete = await service.get(loading.headers.get("ETag"));
  assert.equal(complete.status, 200);
  assert.equal((await complete.json()).refreshing, false);
  assert.notEqual(complete.headers.get("ETag"), loading.headers.get("ETag"));
});

test("unavailable snapshots remain 503 with a response body even when the client sends a matching validator", async () => {
  const service = route();
  const live = await service.get();
  const unavailable = {
    ...snapshot(),
    assets: [],
    status: "unavailable",
    sources: [],
    warnings: ["Market providers are temporarily unavailable."],
  };
  service.set(unavailable);
  const firstFailure = await service.get(live.headers.get("ETag"));
  assert.equal(firstFailure.status, 503);
  assert.deepEqual(await firstFailure.json(), unavailable);
  const repeated = await service.get(firstFailure.headers.get("ETag") || "*");
  assert.equal(repeated.status, 503);
  assert.deepEqual(await repeated.json(), unavailable);
});

test("unexpected provider failures cannot become a cached 304 success", async () => {
  const service = route();
  const live = await service.get();
  service.fail();
  const failed = await service.get(live.headers.get("ETag"));
  assert.equal(failed.status, 503);
  const data = await failed.json();
  assert.equal(data.status, "unavailable");
  assert.equal(data.assets.length, 0);
  assert.ok(data.warnings.length > 0);
});
