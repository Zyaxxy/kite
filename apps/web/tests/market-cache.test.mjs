import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sdk = require("../../../packages/sdk/dist/index.js");
const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/server/markets.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const initialTime = Date.parse("2026-09-13T12:00:00Z");
const mint = "11111111111111111111111111111111";

function snapshot(asset = {}, extra = {}) {
  const assets = [
    {
      mint,
      symbol: "NVDAx",
      underlyingSymbol: "NVDA",
      name: "NVIDIA xStock",
      issuer: "xstocks",
      kind: "equity",
      verified: true,
      tradingHalted: false,
      decimals: null,
      priceUsd: null,
      priceObservedAt: null,
      priceSource: null,
      priceBlockId: null,
      change24hPct: null,
      volume24hUsd: null,
      liquidityUsd: null,
      marketCapUsd: null,
      updatedAt: null,
      underlyingPriceUsd: null,
      underlyingPriceUpdatedAt: null,
      underlyingMarketCapUsd: null,
      ...asset,
    },
  ];
  return {
    assets,
    baskets: sdk.resolveReviewedMarketBaskets(assets),
    network: "mainnet-beta",
    asOf: new Date(initialTime).toISOString(),
    status: "partial",
    warnings: [],
    sources: ["xStocks issuer catalog", "PreStocks issuer catalog"],
    ...extra,
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function cache({ getCatalog = async () => snapshot(), getMarkets } = {}) {
  let now = initialTime;
  const calls = { catalog: 0, prices: [] };
  const exports = {};
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  runInNewContext(compiled, {
    exports,
    Date: Clock,
    process: { env: {} },
    require: (name) => {
      assert.equal(name, "@kite/sdk");
      return {
        resolveReviewedMarketBaskets: sdk.resolveReviewedMarketBaskets,
        getMainnetCatalog: () => {
          calls.catalog++;
          return getCatalog();
        },
        getMainnetMarkets: (options) => {
          calls.prices.push(options);
          return getMarkets(options);
        },
      };
    },
  });
  return {
    ...exports,
    calls,
    advance: (milliseconds) => {
      now += milliseconds;
    },
  };
}

async function withoutProviderWait(task) {
  return Promise.race([
    task,
    new Promise((_, reject) =>
      setImmediate(() =>
        reject(new Error("Display blocked on unfinished provider work")),
      ),
    ),
  ]);
}

test("cold display returns verified issuer assets before its blocked price request finishes", async () => {
  const prices = deferred();
  const service = cache({ getMarkets: () => prices.promise });
  const background = [];
  const first = await withoutProviderWait(
    service.getServerMarkets({ waitUntil: (task) => background.push(task) }),
  );
  assert.equal(first.refreshing, true);
  assert.equal(first.assets[0].mint, mint);
  assert.equal(first.assets[0].verified, true);
  assert.equal(first.assets[0].priceUsd, null);
  assert.equal(service.calls.catalog, 1);
  assert.equal(service.calls.prices.length, 1);
  assert.equal(service.calls.prices[0].catalog.assets[0].mint, mint);
  assert.equal(background.length, 1);

  prices.resolve(
    snapshot({ priceUsd: 120, priceObservedAt: "2026-09-13T12:00:01Z" }),
  );
  await Promise.all(background);
  const ready = await service.getServerMarkets();
  assert.equal(ready.refreshing, false);
  assert.equal(ready.assets[0].priceUsd, 120);
});

test("progressive token prices become readable while reference enrichment is still blocked", async () => {
  const references = deferred();
  const service = cache({ getMarkets: () => references.promise });
  const background = [];
  await service.getServerMarkets({
    waitUntil: (task) => background.push(task),
  });
  const tokenPriceTime = "2026-09-13T12:00:02Z";
  const tokens = snapshot({
    priceUsd: 121,
    priceObservedAt: tokenPriceTime,
    priceSource: "jupiter-tokens-v2",
  });
  service.calls.prices[0].onUpdate(tokens);
  const partial = await withoutProviderWait(
    service.getServerMarkets({ waitUntil: (task) => background.push(task) }),
  );
  assert.equal(partial.refreshing, true);
  assert.equal(partial.assets[0].priceUsd, 121);
  assert.equal(partial.assets[0].priceObservedAt, tokenPriceTime);
  assert.equal(partial.assets[0].underlyingPriceUsd, null);
  assert.equal(service.calls.prices.length, 1);

  references.resolve(
    snapshot(
      {
        ...tokens.assets[0],
        underlyingPriceUsd: 119,
        underlyingPriceUpdatedAt: "2026-09-12T20:00:00Z",
      },
      {
        sources: [...tokens.sources, "Jupiter Tokens V2", "Jupiter Price V3"],
      },
    ),
  );
  await Promise.all(background);
  const complete = await service.getServerMarkets();
  assert.equal(complete.refreshing, false);
  assert.equal(complete.assets[0].underlyingPriceUsd, 119);
  assert.equal(complete.assets[0].priceUsd, 121);
  assert.equal(
    partial.assets[0].underlyingPriceUsd,
    null,
    "Already returned snapshots are not mutated",
  );
});

test("simultaneous cold readers share one catalog request and one market refresh", async () => {
  const identity = deferred();
  const prices = deferred();
  const service = cache({
    getCatalog: () => identity.promise,
    getMarkets: () => prices.promise,
  });
  const background = [];
  const readers = Array.from({ length: 8 }, () =>
    service.getServerMarkets({ waitUntil: (task) => background.push(task) }),
  );
  assert.equal(service.calls.catalog, 1);
  assert.equal(service.calls.prices.length, 0);
  identity.resolve(snapshot());
  const initial = await withoutProviderWait(Promise.all(readers));
  assert.ok(
    initial.every(
      (value) => value.refreshing && value.assets[0].priceUsd === null,
    ),
  );
  assert.equal(service.calls.prices.length, 1);
  const settledRead = service.getServerMarkets();
  prices.resolve(snapshot({ priceUsd: 123 }));
  await Promise.all(background);
  assert.equal((await settledRead).assets[0].priceUsd, 123);
  assert.equal(service.calls.prices.length, 1);
});

test("expired reads return immediately and retained references never become token prices or newer observations", async () => {
  const refreshingPrices = deferred();
  const priceTime = "2026-09-13T11:59:59Z";
  const referenceTime = "2026-09-12T20:00:00Z";
  let requests = 0;
  const service = cache({
    getMarkets: () =>
      ++requests === 1
        ? Promise.resolve(
            snapshot(
              {
                priceUsd: 125,
                priceObservedAt: priceTime,
                underlyingPriceUsd: 124,
                underlyingPriceUpdatedAt: referenceTime,
                underlyingMarketCapUsd: 1_000_000,
              },
              {
                sources: [
                  "xStocks issuer catalog",
                  "PreStocks issuer catalog",
                  "Jupiter Price V3",
                ],
              },
            ),
          )
        : refreshingPrices.promise,
  });
  await service.getServerMarkets();
  service.advance(31_000);
  const background = [];
  const stale = await withoutProviderWait(
    service.getServerMarkets({ waitUntil: (task) => background.push(task) }),
  );
  assert.equal(stale.refreshing, true);
  assert.equal(stale.assets[0].priceUsd, 125);
  assert.equal(stale.assets[0].priceObservedAt, priceTime);
  assert.equal(stale.assets[0].underlyingPriceUpdatedAt, referenceTime);
  await Promise.resolve();
  assert.equal(service.calls.prices[1].includePriceReferences, false);

  const unpriced = snapshot({}, { asOf: "2026-09-13T12:00:31Z" });
  service.calls.prices[1].onUpdate(unpriced);
  const interim = await service.getServerMarkets({
    waitUntil: (task) => background.push(task),
  });
  assert.equal(interim.refreshing, true);
  assert.equal(interim.assets[0].priceUsd, null);
  assert.equal(interim.assets[0].priceObservedAt, null);
  assert.equal(interim.assets[0].underlyingPriceUsd, 124);
  assert.equal(interim.assets[0].underlyingMarketCapUsd, 1_000_000);
  assert.equal(interim.assets[0].underlyingPriceUpdatedAt, referenceTime);
  assert.equal(
    interim.baskets.find((basket) => basket.id === "sol-digital-leaders")
      .available,
    false,
  );

  refreshingPrices.resolve(unpriced);
  await Promise.all(background);
  const complete = await service.getServerMarkets();
  assert.equal(complete.refreshing, false);
  assert.equal(complete.assets[0].priceUsd, null);
  assert.equal(complete.assets[0].underlyingPriceUpdatedAt, referenceTime);
});

test("a rejected cold refresh exposes its failure and backs off before retrying", async () => {
  const failure = deferred();
  let requests = 0;
  const service = cache({
    getMarkets: () =>
      ++requests === 1
        ? failure.promise
        : Promise.resolve(snapshot({ priceUsd: 126 })),
  });
  const background = [];
  await service.getServerMarkets({
    waitUntil: (task) => background.push(task),
  });
  failure.reject(new Error("Provider transport failed"));
  await Promise.all(background);
  const coolingDown = await Promise.all(
    Array.from({ length: 8 }, () => service.getServerMarkets()),
  );
  for (const value of coolingDown) {
    assert.equal(value.refreshing, false);
    assert.equal(value.status, "partial");
    assert.equal(value.assets[0].priceUsd, null);
    assert.equal(value.asOf, new Date(initialTime).toISOString());
    assert.ok(
      value.warnings.some((warning) =>
        /refresh|provider|unavailable/i.test(warning),
      ),
    );
  }
  assert.equal(
    service.calls.prices.length,
    1,
    "Concurrent outage reads reuse the failure cooldown",
  );
  service.advance(5_001);
  const recovered = await service.getServerMarkets();
  assert.equal(recovered.refreshing, false);
  assert.equal(recovered.assets[0].priceUsd, 126);
  assert.equal(service.calls.prices.length, 2);
});

test("failed refreshes retain observed prices and source dates with a visible warning during backoff", async () => {
  const failure = deferred();
  const priceTime = "2026-09-13T11:59:50Z";
  const referenceTime = "2026-09-12T20:00:00Z";
  const original = snapshot(
    {
      priceUsd: 128,
      priceObservedAt: priceTime,
      priceSource: "jupiter-price-v3",
      underlyingPriceUsd: 127,
      underlyingPriceUpdatedAt: referenceTime,
    },
    {
      status: "live",
      sources: [
        "xStocks issuer catalog",
        "PreStocks issuer catalog",
        "Jupiter Price V3",
      ],
    },
  );
  let requests = 0;
  const service = cache({
    getMarkets: () =>
      ++requests === 1 ? Promise.resolve(original) : failure.promise,
  });
  await service.getServerMarkets();
  service.advance(31_000);
  const background = [];
  const refreshing = await withoutProviderWait(
    service.getServerMarkets({ waitUntil: (task) => background.push(task) }),
  );
  assert.equal(refreshing.refreshing, true);
  failure.reject(new Error("Provider transport failed"));
  await Promise.all(background);

  const stale = await service.getServerMarkets();
  assert.equal(stale.refreshing, false);
  assert.equal(stale.status, "partial");
  assert.equal(stale.asOf, original.asOf);
  assert.equal(stale.assets[0].priceUsd, 128);
  assert.equal(stale.assets[0].priceObservedAt, priceTime);
  assert.equal(stale.assets[0].priceSource, "jupiter-price-v3");
  assert.equal(stale.assets[0].underlyingPriceUsd, 127);
  assert.equal(stale.assets[0].underlyingPriceUpdatedAt, referenceTime);
  assert.ok(stale.sources.includes("Jupiter Price V3"));
  assert.ok(
    stale.warnings.some((warning) =>
      /refresh|provider|unavailable/i.test(warning),
    ),
  );
  assert.equal(
    original.warnings.length,
    0,
    "An earlier successful response remains unchanged",
  );
  service.advance(4_999);
  await service.getServerMarkets();
  assert.equal(
    service.calls.prices.length,
    2,
    "No retry starts before the outage cooldown expires",
  );
});

test("an empty unavailable catalog skips pricing and is retried after the short outage cache expires", async () => {
  let catalogRequests = 0;
  const service = cache({
    getCatalog: async () =>
      ++catalogRequests === 1
        ? snapshot(
            {},
            { assets: [], baskets: [], status: "unavailable", sources: [] },
          )
        : snapshot(),
    getMarkets: async () => snapshot({ priceUsd: 127 }),
  });
  const background = [];
  const outage = await service.getServerMarkets({
    waitUntil: (task) => background.push(task),
  });
  assert.equal(outage.status, "unavailable");
  assert.equal(outage.refreshing, false);
  assert.equal(outage.assets.length, 0);
  assert.equal(background.length, 0);
  assert.equal(service.calls.prices.length, 0);
  service.advance(4_000);
  await service.getServerMarkets();
  assert.equal(service.calls.catalog, 1);
  service.advance(1_001);
  const recovered = await service.getServerMarkets();
  assert.equal(recovered.assets[0].priceUsd, 127);
  assert.equal(service.calls.catalog, 2);
  assert.equal(service.calls.prices.length, 1);
});
