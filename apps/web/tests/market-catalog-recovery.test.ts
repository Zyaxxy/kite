import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  hasCompleteIssuerCatalogs,
  resolveAllMarketBaskets,
  type MarketAsset,
  type MarketSnapshot,
} from "@kite/sdk";

type MarketService = typeof import("../lib/server/markets");
const fixture = (complete: boolean): MarketSnapshot => ({
  assets: [
    {
      mint: "11111111111111111111111111111111",
      symbol: "AAPLx",
      underlyingSymbol: "AAPL",
      name: "Apple fixture",
      issuer: "xstocks",
      kind: "equity",
      verified: true,
      tradingHalted: false,
      decimals: 6,
      priceUsd: null,
      priceObservedAt: null,
      logoUrl: null,
      change24hPct: null,
      volume24hUsd: null,
      liquidityUsd: null,
      marketCapUsd: null,
      updatedAt: null,
      sourceUrl: "https://issuer.example.test",
    } satisfies MarketAsset,
  ],
  baskets: [],
  network: "mainnet-beta",
  asOf: "2026-10-02T00:00:00Z",
  status: complete ? "live" : "partial",
  backpackSecurities: [],
  sources: complete
    ? [
        "xStocks issuer catalog",
        "PreStocks issuer catalog",
        "Backpack securities catalog",
        "Backpack Solana mappings",
      ]
    : ["xStocks issuer catalog"],
  warnings: complete ? [] : ["PreStocks and Backpack unavailable"],
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
  provider: () => Promise<MarketSnapshot>,
  stored?: MarketSnapshot,
) {
  let now = Date.parse("2026-10-02T00:00:00Z");
  let redis = stored ?? null;
  let disk = stored ?? null;
  let readable = true;
  let providerCalls = 0;
  const writes: MarketSnapshot[] = [];
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const caches = {
    isRedisConfigured: () => true,
    isDiskCacheConfigured: () => true,
    getRedisCatalog: async () => (readable ? redis : null),
    getDiskCatalog: async () => (readable ? disk : null),
    setRedisCatalog: async (value: MarketSnapshot) => {
      redis = value;
      writes.push(value);
    },
    setDiskCatalog: async (value: MarketSnapshot) => {
      disk = value;
      writes.push(value);
    },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    Date: Clock,
    process: { env: {} },
    require: (name: string) =>
      name === "@kite/sdk"
        ? {
            hasCompleteIssuerCatalogs,
            resolveAllMarketBaskets,
            getMainnetCatalog: async () => {
              providerCalls++;
              return provider();
            },
          }
        : caches,
  });
  return {
    api: exports as MarketService,
    writes,
    calls: () => providerCalls,
    stored: () => ({ redis, disk }),
    advance: (ms: number) => {
      now += ms;
    },
    hidePersistentReads: () => {
      readable = false;
    },
  };
}

test("incomplete Redis and disk catalogs cannot prevent fresh issuer coverage recovery", async () => {
  const incomplete = fixture(false);
  const complete = fixture(true);
  const run = service(async () => complete, incomplete);
  const result = await run.api.getServerMarketCatalog();
  assert.equal(hasCompleteIssuerCatalogs(result), true);
  assert.equal(run.calls(), 1);
  assert.equal(run.writes.length, 2);
  assert.ok(run.writes.every(hasCompleteIssuerCatalogs));
  assert.equal(hasCompleteIssuerCatalogs(incomplete), false);
});

test("incomplete in-memory issuer coverage retries after 30 seconds instead of one hour", async () => {
  let requests = 0;
  const run = service(async () => fixture(++requests > 1));
  assert.equal(
    hasCompleteIssuerCatalogs(await run.api.getServerMarketCatalog()),
    false,
  );
  assert.equal(run.writes.length, 0);
  run.advance(29_999);
  assert.equal(
    hasCompleteIssuerCatalogs(await run.api.getServerMarketCatalog()),
    false,
  );
  assert.equal(run.calls(), 1);
  run.advance(1);
  assert.equal(
    hasCompleteIssuerCatalogs(await run.api.getServerMarketCatalog()),
    true,
  );
  assert.equal(run.calls(), 2);
  assert.equal(run.writes.length, 2);
});

test("a later issuer outage never overwrites complete persisted catalogs", async () => {
  let requests = 0;
  const run = service(async () => fixture(++requests === 1));
  assert.equal(
    hasCompleteIssuerCatalogs(await run.api.getServerMarketCatalog()),
    true,
  );
  const good = run.stored();
  assert.equal(run.writes.length, 2);
  run.hidePersistentReads();
  run.advance(3_600_001);
  assert.equal(
    hasCompleteIssuerCatalogs(await run.api.getServerMarketCatalog()),
    false,
  );
  assert.equal(run.calls(), 2);
  assert.equal(run.writes.length, 2);
  assert.strictEqual(run.stored().redis, good.redis);
  assert.strictEqual(run.stored().disk, good.disk);
});
