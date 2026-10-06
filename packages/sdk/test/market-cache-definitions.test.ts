import assert from "node:assert/strict";
import test from "node:test";
import { createKiteCore } from "../src/state/kite-core";
import { resolveAllMarketBaskets, type MarketSnapshot } from "../src/markets";
const cached: MarketSnapshot = {
  network: "mainnet-beta",
  assets: [],
  baskets: [],
  asOf: "2026-09-30T01:00:00.000Z",
  status: "partial",
  sources: [],
  warnings: ["Prices unavailable"],
};
test("persisted and fresh snapshots use current definitions without changing observed prices or timestamps", async () => {
  const writes = new Map<string, string>();
  const core = createKiteCore({
    storage: {
      getItem: (key) =>
        key === "market"
          ? JSON.stringify({ snapshot: cached, etag: "old", cachedAt: 1 })
          : null,
      setItem: (key, value) => {
        writes.set(key, value);
      },
    },
    client: {
      getMarkets: async () => ({
        notModified: false,
        etag: "fresh",
        data: cached,
      }),
    },
    accountKey: "paper",
    watchlistKey: "watch",
    marketKey: "market",
    now: () => 1,
  });
  await core.hydrate();
  assert.deepEqual(
    core.getSnapshot().market?.baskets,
    resolveAllMarketBaskets([]),
  );
  assert.equal(core.getSnapshot().market?.asOf, cached.asOf);
  assert.equal(core.getSnapshot().customBaskets.length, 0);
  await core.refresh();
  await core.flush();
  assert.equal(core.getSnapshot().market?.assets, cached.assets);
  assert.ok(
    core
      .getSnapshot()
      .market?.baskets.some((basket) => basket.id === "sol-digital-economy"),
  );
  assert.ok(
    core
      .getSnapshot()
      .market?.baskets.every(
        (basket) => !basket.available && !basket.liquidityAudit,
      ),
  );
  const persisted = JSON.parse(writes.get("market")!);
  assert.equal(persisted.snapshot.asOf, cached.asOf);
  assert.deepEqual(persisted.snapshot.baskets, resolveAllMarketBaskets([]));
});
