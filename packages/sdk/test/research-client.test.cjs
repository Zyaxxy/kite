const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: wait } = require("node:timers/promises");
const { createResearchClient } = require("../dist/research-client.js");

// Transport fixtures live only in tests; no company values are supplied by the client cache.
const response = (mint, status = "available") => ({
  mint,
  symbol: "TEST",
  asOf: new Date().toISOString(),
  status,
  profile: null,
  bars: [],
  technicals: null,
  fundamentals: [],
  news: [],
  events: [],
  sources: [],
  warnings: [],
});
const signal = () => new AbortController().signal;
function deferredLoader() {
  const calls = [];
  const loader = (mint, abortSignal) =>
    new Promise((resolve, reject) => {
      calls.push({ mint, signal: abortSignal, resolve, reject });
      abortSignal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  return { calls, loader };
}

test("research readers coalesce, cancel independently, and reuse a fresh response", async () => {
  const { calls, loader } = deferredLoader();
  const client = createResearchClient(loader);
  const first = new AbortController();
  const a = client.load("one", first.signal);
  const b = client.load("one", signal());
  await Promise.resolve();
  assert.equal(calls.length, 1);
  first.abort();
  await assert.rejects(a, { name: "AbortError" });
  assert.equal(calls[0].signal.aborted, false);
  const value = response("one");
  calls[0].resolve(value);
  assert.equal(await b, value);
  assert.equal(await client.load("one", signal()), value);
  assert.equal(calls.length, 1);
  assert.equal(client.peek("one").asOf, value.asOf);
  const forced = client.load("one", signal(), true);
  await Promise.resolve();
  assert.equal(calls.length, 2);
  calls[1].resolve(value);
  await forced;
});

test("stale research stays readable during revalidation and after provider failure, then expires", async () => {
  let now = 0;
  let fail = false;
  let calls = 0;
  const client = createResearchClient(
    async (mint) => {
      calls += 1;
      if (fail) throw new Error("Provider unavailable");
      return response(mint);
    },
    { now: () => now, freshMs: 10, retainMs: 100 },
  );
  const value = await client.load("one", signal());
  now = 11;
  fail = true;
  const refresh = client.load("one", signal());
  assert.equal(client.peek("one"), value);
  await assert.rejects(refresh, /Provider unavailable/);
  assert.equal(client.peek("one"), value);
  assert.equal(calls, 2);
  now = 101;
  assert.equal(client.peek("one"), null);
});

test("partial and unavailable research retry sooner than complete responses", async () => {
  let now = 0;
  const calls = new Map();
  const client = createResearchClient(
    async (mint) => {
      calls.set(mint, (calls.get(mint) ?? 0) + 1);
      return response(mint, mint);
    },
    { now: () => now, freshMs: 100, partialMs: 10, unavailableMs: 5 },
  );
  for (const mint of ["available", "partial", "unavailable"])
    await client.load(mint, signal());
  now = 6;
  for (const mint of ["available", "partial", "unavailable"])
    await client.load(mint, signal());
  assert.deepEqual([...calls.values()], [1, 1, 2]);
  now = 11;
  await client.load("partial", signal());
  assert.equal(calls.get("partial"), 2);
});

test("rapid remounts share the request, and the last departing reader aborts it", async () => {
  const { calls, loader } = deferredLoader();
  const client = createResearchClient(loader, { abortGraceMs: 10 });
  const first = new AbortController();
  const a = client.load("one", first.signal);
  await Promise.resolve();
  first.abort();
  await assert.rejects(a, { name: "AbortError" });
  const second = new AbortController();
  const b = client.load("one", second.signal);
  await wait(20);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal.aborted, false);
  second.abort();
  await assert.rejects(b, { name: "AbortError" });
  await wait(20);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(client.peek("one"), null);
  const retry = client.load("one", signal());
  await Promise.resolve();
  assert.equal(calls.length, 2);
  calls[1].resolve(response("one"));
  await retry;
});

test("invalid identity, data arrays, dates, and status never enter the research cache", async () => {
  for (const invalid of [
    { ...response("one"), mint: "another" },
    { ...response("one"), news: null },
    { ...response("one"), asOf: "invalid date" },
    { ...response("one"), status: "unknown" },
    { ...response("one"), refreshing: "yes" },
  ]) {
    const client = createResearchClient(async () => invalid);
    await assert.rejects(client.load("one", signal()), /invalid response/);
    assert.equal(client.peek("one"), null);
  }
});

test("the research cache evicts the least recently read response", async () => {
  const client = createResearchClient(async (mint) => response(mint), {
    maxEntries: 2,
  });
  await client.load("one", signal());
  await client.load("two", signal());
  client.peek("one");
  await client.load("three", signal());
  assert.ok(client.peek("one"));
  assert.equal(client.peek("two"), null);
  assert.ok(client.peek("three"));
});

test("deadline failure cancels transport and permits a later retry", async () => {
  const { calls, loader } = deferredLoader();
  const client = createResearchClient(loader, { timeoutMs: 10 });
  await assert.rejects(client.load("one", signal()), /too long to respond/);
  assert.equal(calls[0].signal.aborted, true);
  const retry = client.load("one", signal());
  await Promise.resolve();
  calls[1].resolve(response("one"));
  assert.equal((await retry).mint, "one");
});

test("already cancelled readers never start a provider request", async () => {
  let calls = 0;
  const client = createResearchClient(async (mint) => {
    calls += 1;
    return response(mint);
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.load("one", controller.signal), {
    name: "AbortError",
  });
  assert.equal(calls, 0);
});

test("server observation age bounds client freshness instead of restarting its TTL", async () => {
  const observedAt = Date.parse("2026-09-13T12:00:00.000Z");
  let now = observedAt + 900;
  let calls = 0;
  const value = {
    ...response("one"),
    asOf: new Date(observedAt).toISOString(),
  };
  const client = createResearchClient(
    async () => {
      calls += 1;
      return value;
    },
    {
      now: () => now,
      freshMs: 1_000,
    },
  );
  await client.load("one", signal());
  now = observedAt + 999;
  await client.load("one", signal());
  assert.equal(calls, 1);
  now = observedAt + 1_000;
  await client.load("one", signal());
  assert.equal(calls, 2);
  now += 1;
  await client.load("one", signal());
  assert.equal(calls, 3);
  assert.equal(client.peek("one").asOf, value.asOf);
});

test("refreshing server snapshots remain readable but immediately eligible for revalidation", async () => {
  let calls = 0;
  const value = response("one");
  const client = createResearchClient(async () => {
    calls += 1;
    return { ...value, refreshing: calls === 1 };
  });
  await client.load("one", signal());
  assert.equal(client.peek("one").refreshing, true);
  const completed = await client.load("one", signal());
  assert.equal(calls, 2);
  assert.equal(completed.refreshing, false);
  assert.equal(await client.load("one", signal()), completed);
  assert.equal(calls, 2);
  assert.equal(completed.asOf, value.asOf);
});
