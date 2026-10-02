import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair } from "@solana/web3.js";
import {
  resolveAllMarketBaskets,
  hasCompleteIssuerCatalogs,
  type MarketAsset,
  type MarketSnapshot,
} from "@kite/sdk";

type MarketService = typeof import("../lib/server/markets");
function previousReleaseSnapshot(): MarketSnapshot {
  const observedAt = new Date(Date.now() - 1000).toISOString();
  const assets = ["NVDA", "V", "MA", "JPM"].map(
    (symbol, index): MarketAsset => ({
      mint: Keypair.generate().publicKey.toBase58(),
      symbol: `${symbol}x`,
      underlyingSymbol: symbol,
      name: `${symbol} test fixture`,
      issuer: "xstocks",
      kind: "equity",
      verified: true,
      tradingHalted: false,
      decimals: 6,
      sourceUrl: "https://issuer.example.test",
      logoUrl: null,
      priceUsd: 100 + index,
      priceObservedAt: observedAt,
      priceSource: "jupiter-price-v3",
      updatedAt: observedAt,
      change24hPct: null,
      volume24hUsd: null,
      liquidityUsd: null,
      marketCapUsd: null,
      underlyingPriceUsd: 90 + index,
      underlyingPriceUpdatedAt: "2026-09-01T00:00:00Z",
    }),
  );
  return {
    network: "mainnet-beta",
    assets,
    asOf: observedAt,
    status: "partial",
    sources: ["xStocks issuer catalog", "PreStocks issuer catalog"],
    warnings: ["Stored observation remains historical."],
    baskets: [
      {
        id: "sol-mag7",
        name: "Obsolete allocation",
        ticker: "OLD",
        description: "Old cached definition",
        assets: [{ asset: assets[0], weight: 10_000 }],
        missingSymbols: [],
        available: true,
      },
      {
        id: "retired-cache-only-basket",
        name: "Retired",
        ticker: "OLD",
        description: "Removed definition",
        assets: [],
        missingSymbols: [],
        available: true,
      },
    ],
  };
}

function cachedService(store: "redis" | "disk", stored: MarketSnapshot) {
  let providerCalls = 0;
  const exports = {};
  const cache = {
    isRedisConfigured: () => store === "redis",
    isDiskCacheConfigured: () => store === "disk",
    getRedisCatalog: async () => stored,
    getDiskCatalog: async () => stored,
    getRedisMarketSnapshot: async () => stored,
    getDiskMarketSnapshot: async () => stored,
    setRedisCatalog: async () => undefined,
    setDiskCatalog: async () => undefined,
    setRedisMarketSnapshot: async () => undefined,
    setDiskMarketSnapshot: async () => undefined,
  };
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("../lib/server/markets.ts", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      process: { env: {} },
      require: (name: string) =>
        name === "@kite/sdk"
          ? {
              resolveAllMarketBaskets,
              hasCompleteIssuerCatalogs,
              getMainnetCatalog: async () => {
                providerCalls++;
                throw new Error("Unexpected catalog reload");
              },
              getMainnetMarkets: async () => {
                providerCalls++;
                throw new Error("Unexpected price reload");
              },
            }
          : cache,
    },
  );
  return { api: exports as MarketService, providerCalls: () => providerCalls };
}

for (const store of ["redis", "disk"] as const) {
  test(`${store} observations keep prices but cannot control current order allocations or hide new themes`, async () => {
    const stored = previousReleaseSnapshot();
    const service = cachedService(store, stored);
    const expected = resolveAllMarketBaskets(stored.assets);
    const catalog = await service.api.getServerMarketCatalog();
    const display = await service.api.getServerMarkets();
    // Both preparation's issuer catalog and display snapshots use this release's definitions.
    for (const snapshot of [
      catalog,
      display,
      await service.api.getServerMarketCatalog(),
      await service.api.getServerMarkets(),
    ]) {
      assert.deepEqual(snapshot.baskets, expected);
      assert.equal(
        snapshot.baskets.some(
          (basket) => basket.id === "retired-cache-only-basket",
        ),
        false,
      );
      assert.equal(
        snapshot.baskets.find((basket) => basket.id === "sol-payment-networks")
          ?.available,
        true,
      );
      assert.notEqual(
        snapshot.baskets.find((basket) => basket.id === "sol-mag7")?.assets[0]
          .weight,
        10_000,
      );
      assert.strictEqual(
        snapshot.assets,
        stored.assets,
        "No prices or observation timestamps are replaced",
      );
      assert.equal(snapshot.asOf, stored.asOf);
      assert.deepEqual(snapshot.warnings, stored.warnings);
      assert.deepEqual(snapshot.sources, stored.sources);
    }
    assert.equal(
      service.providerCalls(),
      0,
      "Definition hydration must not delay cached reads with provider calls",
    );
    assert.equal(
      stored.baskets.length,
      2,
      "Hydration does not mutate shared stored objects",
    );
  });
}
