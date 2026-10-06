import test from "node:test";
import assert from "node:assert/strict";
import {
  KeeperError,
  requireCollectorAuthorization,
  runIsolatedCollector,
  withCollectorLease,
  keeperStore,
} from "../lib/server/recurring-keeper";

const secret = "test-executor-secret-at-least-32-characters";
test("collector requires explicit configured bearer tokens and never falls back to transaction or faucet secrets", () => {
  assert.throws(
    () => requireCollectorAuthorization(null, {}),
    (error: unknown) => error instanceof KeeperError && error.status === 503,
  );
  assert.throws(
    () =>
      requireCollectorAuthorization(`Bearer ${secret}`, {
        KITE_RECURRING_AUTH_SECRET: secret,
      }),
    /not configured/,
  );
  for (const authorization of [
    null,
    secret,
    `Basic ${secret}`,
    `Bearer ${secret} extra`,
    "Bearer incorrect",
  ]) {
    assert.throws(
      () =>
        requireCollectorAuthorization(authorization, {
          KITE_RECURRING_EXECUTOR_SECRET: secret,
        }),
      (error: unknown) => error instanceof KeeperError && error.status === 401,
    );
  }
  requireCollectorAuthorization(`Bearer ${secret}`, {
    KITE_RECURRING_EXECUTOR_SECRET: secret,
  });
  requireCollectorAuthorization(`Bearer ${secret}`, { CRON_SECRET: secret });
});

test("a failed wallet does not abort later debits, and submitted/unknown is never counted as collected", async () => {
  const processed: string[] = [];
  const result = await runIsolatedCollector({
    entries: [
      "underfunded",
      "confirmed",
      "submitted",
      "unknown",
      "not-due",
      "expired",
    ],
    address: (entry) => entry,
    duePeriod: (entry) => (entry === "not-due" ? null : 2),
    deadline: Date.now() + 1000,
    collect: async (entry) => {
      processed.push(entry);
      if (entry === "underfunded") throw new Error("Not enough KUSD");
      return {
        signature: entry,
        status: entry as "confirmed" | "submitted" | "unknown" | "expired",
      };
    },
  });
  assert.deepEqual(processed, [
    "underfunded",
    "confirmed",
    "submitted",
    "unknown",
    "expired",
  ]);
  assert.equal(result.collected, 1);
  assert.equal(result.pending, 2);
  assert.equal(result.failed, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.due, 5);
});

test("collector respects both the scan bound and shared wall-clock deadline", async () => {
  let now = 0;
  const options = {
    entries: [1, 2, 3, 4],
    address: String,
    duePeriod: () => 0,
    deadline: 10,
    now: () => now,
    collect: async () => {
      now += 6;
      return { signature: "confirmed", status: "confirmed" as const };
    },
  };
  const timed = await runIsolatedCollector(options);
  assert.equal(timed.scanned, 2);
  assert.equal(timed.deferred, 2);
  now = 0;
  const bounded = await runIsolatedCollector({ ...options, maxPlans: 1 });
  assert.equal(bounded.scanned, 1);
  assert.equal(bounded.deferred, 3);
});

test("malformed plan decoding is isolated before collection", async () => {
  const result = await runIsolatedCollector({
    entries: ["malformed", "healthy"],
    address: String,
    duePeriod: (entry) => {
      if (entry === "malformed") throw new Error("Invalid guard discriminator");
      return 1;
    },
    collect: async () => ({ signature: "healthy", status: "confirmed" }),
    deadline: Date.now() + 1000,
  });
  assert.equal(result.failed, 1);
  assert.equal(result.collected, 1);
});

test("local development lease excludes overlapping passes and releases after failure", async () => {
  const original = {
    node: process.env.NODE_ENV,
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  Object.assign(process.env, { NODE_ENV: "test" });
  try {
    await withCollectorLease(async () => {
      await assert.rejects(
        () => withCollectorLease(async () => undefined),
        (error: unknown) =>
          error instanceof KeeperError && error.status === 409,
      );
    });
    await assert.rejects(
      () =>
        withCollectorLease(async () => {
          throw new Error("worker failed");
        }),
      /worker failed/,
    );
    assert.equal(
      await withCollectorLease(async () => "next worker"),
      "next worker",
    );
    await keeperStore.write("test-journal", {
      signedTransaction: "same-exact-message",
      authorization: "signed-review",
    });
    assert.deepEqual(await keeperStore.read("test-journal"), {
      signedTransaction: "same-exact-message",
      authorization: "signed-review",
    });
    Object.assign(process.env, { NODE_ENV: "production" });
    await assert.rejects(
      () => withCollectorLease(async () => undefined),
      /Configure Redis/,
    );
  } finally {
    for (const [key, value] of Object.entries({
      NODE_ENV: original.node,
      UPSTASH_REDIS_REST_URL: original.url,
      UPSTASH_REDIS_REST_TOKEN: original.token,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
