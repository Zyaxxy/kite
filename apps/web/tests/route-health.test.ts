import assert from "node:assert/strict";
import test from "node:test";
import {
  createRouteHealthCache,
  type RouteHealthCacheStorage,
} from "../lib/server/route-health-cache";
import {
  fetchWithRouteRetry,
  fetchJupiterQuote,
} from "../lib/server/jupiter-build";

function harness() {
  let now = 1000;
  let allowed = true;
  let claims = 0;
  const entries = new Map<
    string,
    Parameters<RouteHealthCacheStorage["write"]>[1]
  >();
  const leases = new Map<string, string>();
  const storage: RouteHealthCacheStorage = {
    read: async (key) => entries.get(key) ?? null,
    write: async (key, entry) => {
      entries.set(key, entry);
    },
    claim: async (key) => {
      claims++;
      if (leases.has(key)) return null;
      leases.set(key, "lease");
      return "lease";
    },
    release: async (key) => {
      leases.delete(key);
    },
    budget: async () => allowed,
  };
  return {
    storage,
    cache: createRouteHealthCache(storage, () => now),
    advance: (ms: number) => {
      now += ms;
    },
    deny: () => {
      allowed = false;
    },
    claims: () => claims,
  };
}
const successful = async () => ({
  status: "routable" as const,
  probeAmount: "25000000",
  maxAccounts: 32,
  detail: "Observed quote",
});

test("concurrent requests coalesce and a cached observation never loads again within TTL", async () => {
  const { cache, claims } = harness();
  let calls = 0;
  const load = async () => {
    calls++;
    return successful();
  };
  const values = await Promise.all(
    Array.from({ length: 20 }, () =>
      cache.get("mint-pair-band", "25000000", load),
    ),
  );
  assert.equal(calls, 1);
  assert.equal(claims(), 1);
  assert.ok(values.every((value) => value.checkedAt === 1000));
  await cache.get("mint-pair-band", "25000000", load);
  assert.equal(calls, 1);
});

test("shared leases prevent duplicate provider calls across server instances", async () => {
  const { storage, cache } = harness();
  const other = createRouteHealthCache(storage, () => 1000);
  let resolve!: () => void;
  const gate = new Promise<void>((done) => {
    resolve = done;
  });
  let started!: () => void;
  const start = new Promise<void>((done) => {
    started = done;
  });
  const first = cache.get("same-key", "25", async () => {
    started();
    await gate;
    return successful();
  });
  await start;
  let duplicate = 0;
  const result = await other.get("same-key", "25", async () => {
    duplicate++;
    return successful();
  });
  assert.equal(result.status, "unknown");
  assert.equal(duplicate, 0);
  resolve();
  await first;
});

test("budget exhaustion preserves stale dates and absence remains unknown", async () => {
  const h = harness();
  const first = await h.cache.get("observed", "25", successful);
  h.advance(300_001);
  h.deny();
  let calls = 0;
  const stale = await h.cache.get("observed", "25", async () => {
    calls++;
    return successful();
  });
  assert.equal(stale.checkedAt, first.checkedAt);
  assert.equal(stale.expiresAt, first.expiresAt);
  assert.equal(calls, 0);
  assert.equal((await h.cache.get("new", "25", successful)).status, "unknown");
});

test("sustained coverage needs three distinct fresh successes and resets on definitive failure", async () => {
  const h = harness();
  assert.equal((await h.cache.get("key", "25", successful)).consistent, false);
  h.advance(300_000);
  assert.equal((await h.cache.get("key", "25", successful)).consistent, false);
  h.advance(300_000);
  assert.equal((await h.cache.get("key", "25", successful)).consistent, true);
  h.advance(300_000);
  const failed = await h.cache.get("key", "25", async () => ({
    status: "no-route",
    probeAmount: "25",
    maxAccounts: null,
    detail: "No route",
  }));
  assert.equal(failed.consistent, false);
  h.advance(120_000);
  assert.equal((await h.cache.get("key", "25", successful)).consistent, false);
});

test("timeouts stay unknown and are short cached without repeated Jupiter calls", async () => {
  const h = harness();
  let calls = 0;
  const load = async () => {
    calls++;
    throw new Error("timeout");
  };
  const value = await h.cache.get("unknown", "25", load);
  assert.equal(value.status, "unknown");
  assert.equal(value.expiresAt - value.checkedAt, 20_000);
  await h.cache.get("unknown", "25", load);
  assert.equal(calls, 1);
});

test("only no-route failures widen the search and successful routes preserve parameters", async () => {
  const calls: URLSearchParams[] = [];
  const params = new URLSearchParams({
    inputMint: "input",
    outputMint: "output",
    amount: "123",
    taker: "owner",
    destinationTokenAccount: "destination",
    slippageBps: "100",
  });
  const response = await fetchWithRouteRetry(params, async (request) => {
    calls.push(request);
    return calls.length < 3
      ? Response.json({ errorCode: "NO_ROUTES_FOUND" }, { status: 400 })
      : Response.json({ outAmount: "100" });
  });
  assert.deepEqual(
    calls.map((call) => call.get("maxAccounts")),
    ["32", "40", "48"],
  );
  assert.equal(response.headers.get("x-kite-route-max-accounts"), "48");
  for (const call of calls)
    for (const [key, value] of params) assert.equal(call.get(key), value);
  assert.equal(params.has("maxAccounts"), false);
});

test("auth, outage, capacity and slippage failures never trigger routing retries", async () => {
  for (const [status, errorCode] of [
    [401, "NO_ROUTES_FOUND"],
    [429, "NO_ROUTES_FOUND"],
    [503, "NO_ROUTES_FOUND"],
    [400, "MAX_ACCOUNT_GREATER_THAN_MAX"],
    [400, "SLIPPAGE_TOLERANCE_EXCEEDED"],
    [400, "UNRECOGNIZED_ERROR"],
  ] as const) {
    let calls = 0;
    const response = await fetchWithRouteRetry(
      new URLSearchParams(),
      async () => {
        calls++;
        return Response.json({ errorCode }, { status });
      },
    );
    assert.equal(response.status, status);
    assert.equal(calls, 1);
  }
});

test("no-route search stops at 48 accounts", async () => {
  let calls = 0;
  const result = await fetchWithRouteRetry(new URLSearchParams(), async () => {
    calls++;
    return Response.json({ errorCode: "NO_ROUTES_FOUND" }, { status: 400 });
  });
  assert.equal(result.status, 400);
  assert.equal(calls, 3);
});

test("advisory throttling stops after one upstream call and honors key cooldown", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json(
      { error: "Rate limited" },
      { status: 429, headers: { "retry-after": "60" } },
    );
  };
  try {
    const result = await fetchJupiterQuote(
      new URLSearchParams(),
      "fixture-key",
    );
    assert.equal(result.status, 429);
    await assert.rejects(
      fetchJupiterQuote(new URLSearchParams(), "fixture-key"),
      /busy/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});
