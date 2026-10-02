import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  MAX_CUSTOM_BASKET_LEGS,
  resolveAllMarketBaskets,
  type MarketAsset,
  type MarketOptions,
  type MarketSnapshot,
} from "@kite/sdk";

type Service = typeof import("../lib/server/markets");
const now = Date.parse("2026-10-02T00:00:00Z");
const observed = (age = 0) => new Date(now - age).toISOString();
const asset = (
  mint: string,
  patch: Partial<MarketAsset> = {},
): MarketAsset => ({
  mint,
  symbol: mint,
  underlyingSymbol: mint,
  name: mint,
  issuer: "xstocks",
  kind: "equity",
  decimals: 6,
  verified: true,
  tradingHalted: false,
  sourceUrl: "https://issuer.example.test",
  logoUrl: null,
  priceUsd: null,
  priceObservedAt: null,
  priceSource: null,
  change24hPct: null,
  volume24hUsd: null,
  liquidityUsd: null,
  marketCapUsd: null,
  updatedAt: null,
  ...patch,
});
const priced = (mint: string, price = 100, age = 0) =>
  asset(mint, {
    priceUsd: price,
    priceObservedAt: observed(age),
    priceSource: "jupiter-tokens-v2",
  });
const snapshot = (assets: MarketAsset[]): MarketSnapshot => ({
  assets,
  baskets: [],
  network: "mainnet-beta",
  asOf: observed(),
  status: "live",
  warnings: [],
  sources: ["xStocks issuer catalog", "PreStocks issuer catalog"],
});
const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/server/markets.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function service(
  hydrate: (options: MarketOptions) => Promise<MarketSnapshot>,
  stored?: MarketSnapshot,
) {
  const calls: MarketOptions[] = [];
  let clock = now;
  let writes = 0;
  class Clock extends Date {
    static now() {
      return clock;
    }
  }
  const cache = {
    isRedisConfigured: () => Boolean(stored),
    isDiskCacheConfigured: () => false,
    getRedisMarketSnapshot: async () => stored ?? null,
    getDiskMarketSnapshot: async () => null,
    getRedisCatalog: async () => null,
    getDiskCatalog: async () => null,
    setRedisMarketSnapshot: async () => {
      writes++;
    },
    setDiskMarketSnapshot: async () => {
      writes++;
    },
    setRedisCatalog: async () => {
      writes++;
    },
    setDiskCatalog: async () => {
      writes++;
    },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    Date: Clock,
    AbortSignal,
    process: { env: { JUPITER_API_KEY: "test-only" } },
    require: (name: string) =>
      name === "@kite/sdk"
        ? {
            MAX_CUSTOM_BASKET_LEGS,
            resolveAllMarketBaskets,
            getMainnetCatalog: () => {
              throw new Error("Unexpected full catalog reload");
            },
            getMainnetMarkets: async (options: MarketOptions) => {
              calls.push(options);
              return hydrate(options);
            },
          }
        : cache,
  });
  return {
    api: exports as Service,
    calls,
    writes: () => writes,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}
const entries = (value: Map<string, number>) =>
  Array.from(value.entries(), ([mint, price]) => [mint, price]);

test("identity-only basket mints receive fresh selected-only token prices without changing the catalog", async () => {
  const identity = snapshot([
    asset("AAPLx"),
    asset("MSFTx"),
    asset("UNSELECTED"),
  ]);
  const original = structuredClone(identity);
  const run = service(async (options) => {
    assert.deepEqual(
      Array.from(options.catalog!.assets, (a) => a.mint),
      ["AAPLx", "MSFTx"],
    );
    assert.equal(options.catalog!.baskets.length, 0);
    assert.equal(options.includePriceReferences, false);
    assert.deepEqual(Array.from(options.priceFallbackMints!), [
      "AAPLx",
      "MSFTx",
    ]);
    assert.equal(options.pythApiKey, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.onUpdate, undefined);
    return snapshot([priced("AAPLx", 200), priced("MSFTx", 400)]);
  });
  const prices = await run.api.getServerBasketPrices(identity, [
    "AAPLx",
    "MSFTx",
  ]);
  assert.deepEqual(entries(prices), [
    ["AAPLx", 200],
    ["MSFTx", 400],
  ]);
  assert.deepEqual(identity, original);
  assert.equal(run.calls.length, 1);
  assert.equal(run.writes(), 0);
});

test("fresh observations are reused and only missing selected mints are fetched", async () => {
  const identity = snapshot([priced("A", 1, 1000), asset("B"), asset("C")]);
  const stored = snapshot([
    priced("A", 2),
    priced("B", 3, 120_001),
    priced("C", 4),
  ]);
  const run = service(async (options) => {
    assert.deepEqual(
      Array.from(options.catalog!.assets, (a) => a.mint),
      ["B"],
    );
    return snapshot([priced("B", 5)]);
  }, stored);
  await run.api.getServerMarkets();
  assert.deepEqual(
    entries(await run.api.getServerBasketPrices(identity, ["A", "B"])),
    [
      ["A", 2],
      ["B", 5],
    ],
  );
  assert.deepEqual((await run.api.getServerMarkets()).assets, stored.assets);
  assert.equal(run.writes(), 0);
});

test("stale, future and malformed observation timestamps cannot survive hydration", async () => {
  for (const timestamp of [
    observed(120_001),
    observed(-1),
    "not-a-time",
    null,
  ]) {
    const identity = snapshot([priced("A", 100)]);
    identity.assets[0].priceObservedAt = timestamp;
    identity.assets[0].priceBlockId = 123;
    const run = service(async (options) => {
      const copy = options.catalog!.assets[0];
      assert.equal(copy.priceUsd, null);
      assert.equal(copy.priceObservedAt, null);
      assert.equal(copy.priceSource, null);
      assert.equal(copy.priceBlockId, null);
      return snapshot([priced("A", 200)]);
    }, identity);
    await run.api.getServerMarkets();
    assert.deepEqual(
      entries(await run.api.getServerBasketPrices(identity, ["A"])),
      [["A", 200]],
    );
    assert.equal(identity.assets[0].priceUsd, 100);
  }
});

test("underlying reference prices and incomplete hydration never fabricate token prices", async () => {
  const reference = asset("B", {
    underlyingPriceUsd: 999,
    underlyingPriceUpdatedAt: observed(),
    underlyingPriceSource: "pyth",
  });
  const identity = snapshot([asset("A"), reference, asset("C")]);
  const run = service(async () =>
    snapshot([priced("A", 10), reference, priced("C", 30)]),
  );
  assert.deepEqual(
    entries(await run.api.getServerBasketPrices(identity, ["A", "B"])),
    [["A", 10]],
  );
});

test("provider failure retains only still-fresh observations and never overwrites the display cache", async () => {
  const identity = snapshot([asset("A"), asset("B")]);
  const stored = snapshot([priced("A", 100), asset("B"), priced("C", 300)]);
  const run = service(async () => {
    throw new Error("Provider unavailable");
  }, stored);
  await run.api.getServerMarkets();
  assert.deepEqual(
    entries(await run.api.getServerBasketPrices(identity, ["A", "B"])),
    [["A", 100]],
  );
  assert.deepEqual((await run.api.getServerMarkets()).assets, stored.assets);
  assert.equal(run.writes(), 0);
});

test("a price aging out while another mint refreshes is omitted at return", async () => {
  const identity = snapshot([priced("A", 100, 119_000), asset("B")]);
  const run = service(async () => {
    run.advance(2000);
    return snapshot([priced("B", 200, -2000)]);
  });
  assert.deepEqual(
    entries(await run.api.getServerBasketPrices(identity, ["A", "B"])),
    [["B", 200]],
  );
});

test("fresh catalog token observations require no network call", async () => {
  const run = service(async () => {
    throw new Error("Unexpected hydration");
  });
  assert.deepEqual(
    entries(
      await run.api.getServerBasketPrices(snapshot([priced("A", 123)]), ["A"]),
    ),
    [["A", 123]],
  );
  assert.equal(run.calls.length, 0);
});

test("requests are bounded to distinct known reviewed mints", async () => {
  const identity = snapshot(
    Array.from({ length: 13 }, (_, index) => asset(String(index))),
  );
  const run = service(async () => {
    throw new Error("Unexpected hydration");
  });
  for (const mints of [
    [],
    ["unknown"],
    ["0", "0"],
    identity.assets.map((a) => a.mint),
  ])
    await assert.rejects(
      run.api.getServerBasketPrices(identity, mints),
      /distinct reviewed catalog mints/,
    );
  assert.equal(run.calls.length, 0);
});
