const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createKiteCore } = require("../dist/state/kite-core.js");
const { createPaperAccount } = require("../dist/paper.js");
const market = {
  assets: [],
  baskets: [],
  network: "mainnet-beta",
  asOf: new Date().toISOString(),
  status: "available",
};
const setup = (
  storage,
  client = {
    getMarkets: async () => ({ notModified: false, etag: "a", data: market }),
  },
) =>
  createKiteCore({
    storage,
    client,
    accountKey: "account",
    watchlistKey: "watchlist",
  });
test("corrupt saved accounts cannot silently become tradable or overwrite storage", async () => {
  const writes = [];
  const core = setup({
    getItem: (key) => (key === "account" ? "broken" : "[]"),
    setItem: (...args) => writes.push(args),
  });
  await core.hydrate();
  assert.equal(core.getSnapshot().accountReadFailed, true);
  assert.throws(() => core.updateAccount(createPaperAccount), /Reset/);
  await core.refresh();
  await core.flush();
  assert.equal(writes.length, 0);
  core.resetAccount();
  await core.flush();
  assert.equal(writes.length, 1);
  assert.equal(core.getSnapshot().accountReadFailed, false);
});
test("serial native writes preserve rapid updates and bad watchlist does not block account", async () => {
  const saved = createPaperAccount();
  saved.cashUsd = 123;
  const writes = [];
  const core = setup({
    getItem: (key) => (key === "account" ? JSON.stringify(saved) : "{"),
    setItem: async (key, value) => {
      await new Promise((r) => setTimeout(r, 2));
      writes.push([key, value]);
    },
  });
  await core.hydrate();
  assert.equal(core.getSnapshot().account.cashUsd, 123);
  assert.equal(core.getSnapshot().accountReadFailed, false);
  core.toggleWatch("mint-a");
  core.toggleWatch("mint-b");
  await core.flush();
  assert.deepEqual(JSON.parse(writes[1][1]), ["mint-a", "mint-b"]);
});
test("parallel refreshes coalesce and errors retain the last observed prices", async () => {
  let calls = 0;
  let fail = false;
  const core = setup(
    { getItem: () => null, setItem: () => {} },
    {
      getMarkets: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 2));
        if (fail) throw Error("offline");
        return { notModified: false, etag: "a", data: market };
      },
    },
  );
  await Promise.all([core.refresh(), core.refresh()]);
  assert.equal(calls, 1);
  fail = true;
  await core.refresh();
  assert.equal(core.getSnapshot().market, market);
  assert.equal(core.getSnapshot().error, "offline");
});
test("reset cannot race with account hydration", async () => {
  const core = setup({ getItem: () => null, setItem: () => {} });
  assert.throws(() => core.resetAccount(), /still loading/);
  await core.hydrate();
  core.resetAccount();
});

test("an empty saved account is corrupt rather than a fresh virtual cash grant", async () => {
  const core = setup({
    getItem: (key) => (key === "account" ? "" : "[]"),
    setItem: () => {},
  });
  await core.hydrate();
  assert.equal(core.getSnapshot().accountReadFailed, true);
  assert.throws(
    () => core.updateAccount((account) => ({ ...account, cashUsd: 50 })),
    /Reset/,
  );
});
test("due paper plans run on unchanged market responses only while active", async () => {
  let now = Date.parse("2026-09-13T00:00:00Z");
  const saved = createPaperAccount();
  saved.plans = [
    {
      id: "plan",
      targetId: "mint",
      targetType: "asset",
      name: "Plan",
      amountUsd: 10,
      frequency: "daily",
      active: true,
      createdAt: new Date(now).toISOString(),
      nextExecutionAt: new Date(now + 1000).toISOString(),
      lastError: null,
    },
  ];
  const snapshot = {
    ...market,
    assets: [
      {
        mint: "mint",
        symbol: "TEST",
        priceUsd: 2,
        priceObservedAt: new Date(now).toISOString(),
        verified: true,
        tradingHalted: false,
      },
    ],
  };
  let calls = 0;
  const core = createKiteCore({
    storage: {
      getItem: (key) => (key === "account" ? JSON.stringify(saved) : "[]"),
      setItem: () => {},
    },
    client: {
      getMarkets: async () =>
        ++calls === 1
          ? { notModified: false, etag: "same", data: snapshot }
          : { notModified: true, etag: "same" },
    },
    accountKey: "account",
    watchlistKey: "watchlist",
    now: () => now,
  });
  await core.hydrate();
  await core.refresh();
  assert.equal(core.getSnapshot().account.orders.length, 0);
  now += 1000;
  core.setActive(false);
  await core.refresh();
  assert.equal(core.getSnapshot().account.orders.length, 0);
  core.setActive(true);
  await core.refresh();
  assert.equal(core.getSnapshot().account.orders.length, 1);
  assert.equal(core.getSnapshot().account.cashUsd, 9990);
  await core.refresh();
  assert.equal(core.getSnapshot().account.orders.length, 1);
});
test("a subscriber update cannot reorder serialized account writes", async () => {
  const writes = [];
  const core = setup({
    getItem: () => null,
    setItem: (_key, value) => writes.push(JSON.parse(value)),
  });
  await core.hydrate();
  core.subscribe(() => {
    if (core.getSnapshot().account.cashUsd === 9000)
      core.updateAccount((account) => ({ ...account, cashUsd: 8000 }));
  });
  core.updateAccount((account) => ({ ...account, cashUsd: 9000 }));
  await core.flush();
  assert.equal(writes.at(-1).cashUsd, 8000);
});
test("marketKey hydrates cached snapshot immediately and persists refreshed market data", async () => {
  const cachedMarket = {
    assets: [{ mint: "m1", symbol: "NVDAx", priceUsd: 120 }],
    baskets: [],
    network: "mainnet-beta",
    asOf: "2026-09-13T12:00:00Z",
    status: "live",
  };
  const store = new Map([
    ["market", JSON.stringify({ snapshot: cachedMarket, etag: "tag-1", cachedAt: 1000 })],
  ]);
  const writes = [];
  let calledEtag = null;
  const client = {
    getMarkets: async ({ etag }) => {
      calledEtag = etag;
      return {
        notModified: false,
        etag: "tag-2",
        data: { ...cachedMarket, asOf: "2026-09-13T12:01:00Z" },
      };
    },
  };
  const core = createKiteCore({
    storage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
        writes.push([key, JSON.parse(value)]);
      },
    },
    client,
    accountKey: "account",
    watchlistKey: "watchlist",
    marketKey: "market",
    now: () => 2000,
  });
  await core.hydrate();
  assert.equal(core.getSnapshot().loading, false);
  assert.deepEqual(core.getSnapshot().market, cachedMarket);
  await core.refresh();
  await core.flush();
  assert.equal(calledEtag, "tag-1");
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "market");
  assert.equal(writes[0][1].etag, "tag-2");
  assert.equal(writes[0][1].cachedAt, 2000);
});
