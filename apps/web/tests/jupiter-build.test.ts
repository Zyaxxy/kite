import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describeJupiterBuildFailure } from "../lib/server/jupiter-build";

const privateDetail = "https://provider.invalid/?api-key=never-expose-this";
const json = (body: unknown, status = 400, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

test("only the observed exact Swap V2 no-route response establishes a missing executable route", async () => {
  const response = json({ error: "No routes found" });
  const error = await describeJupiterBuildFailure(response, "COPx");
  assert.equal(error.kind, "no-route");
  assert.equal(error.noRoute, true);
  assert.match(error.message, /COPx/);
  assert.match(error.message, /funding token and amount/);
  assert.deepEqual(await response.json(), { error: "No routes found" });
  for (const body of [
    { error: "No routes found because " + privateDetail },
    { error: "Unauthorized" },
    { code: "UNRECOGNIZED_ERROR", message: privateDetail },
  ]) {
    const unknown = await describeJupiterBuildFailure(json(body), "COPx");
    assert.equal(unknown.kind, "request-rejected");
    assert.equal(unknown.noRoute, false);
    assert.doesNotMatch(unknown.message, /never-expose-this|provider.invalid/);
  }
});

for (const [status, kind] of [
  [401, "authentication"],
  [403, "authentication"],
  [429, "rate-limited"],
  [408, "unavailable"],
  [500, "unavailable"],
  [503, "unavailable"],
] as const) {
  test(`HTTP ${status} stays ${kind}, even with a misleading no-route body`, async () => {
    const error = await describeJupiterBuildFailure(
      json({ error: "No routes found" }, status),
      "COPx",
    );
    assert.equal(error.kind, kind);
    assert.equal(error.noRoute, false);
    assert.equal(error.httpStatus, status);
  });
}

test("non-JSON provider errors are sanitized and never called a lack of liquidity", async () => {
  const error = await describeJupiterBuildFailure(
    new Response(privateDetail, { status: 400 }),
    "COPx",
  );
  assert.equal(error.kind, "invalid-response");
  assert.equal(error.noRoute, false);
  assert.doesNotMatch(error.message, /never-expose-this|provider.invalid/);
});

const compiled = ts.transpileModule(
  readFileSync(
    new URL("../lib/server/jupiter-build.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
type BuildModule = typeof import("../lib/server/jupiter-build");
const start = Date.UTC(2026, 9, 1);
function harness(
  replies: (() => Response | Promise<Response>)[],
  keys = "test-key",
) {
  let now = start;
  const waits: number[] = [];
  const timeouts: number[] = [];
  const calls: { key: string; at: number }[] = [];
  const exports = {};
  class FakeDate extends Date {
    static now() {
      return now;
    }
  }
  runInNewContext(compiled, {
    exports,
    Error,
    Date: FakeDate,
    process: { env: { JUPITER_API_KEYS: keys } },
    AbortSignal: {
      timeout: (ms: number) => {
        timeouts.push(ms);
        return undefined;
      },
    },
    setTimeout: (callback: () => void, ms: number) => {
      waits.push(ms);
      now += ms;
      callback();
    },
    fetch: async (_url: string, options: RequestInit) => {
      calls.push({
        key: (options.headers as Record<string, string>)["x-api-key"],
        at: now - start,
      });
      const reply = replies[calls.length - 1];
      assert.ok(
        reply,
        "No extra or individual transaction requests are permitted",
      );
      return reply();
    },
  });
  return { api: exports as BuildModule, waits, timeouts, calls };
}
const limited = (headers?: HeadersInit) => () =>
  json({ code: 429, message: "[API Gateway] Too many requests" }, 429, headers);
const ready = () => json({ swapInstruction: {} }, 200);
const params = new URLSearchParams({
  inputMint: "input",
  outputMint: "output",
});

for (const [name, headers, delay] of [
  ["numeric Retry-After", { "retry-after": "5" }, 5000],
  [
    "HTTP-date Retry-After",
    { "retry-after": new Date(start + 4000).toUTCString() },
    4000,
  ],
  ["reset epoch", { "x-ratelimit-reset": String(start / 1000 + 7) }, 7250],
  [
    "both cooldown headers",
    { "retry-after": "2", "x-ratelimit-reset": String(start / 1000 + 7) },
    7250,
  ],
  ["malformed Retry-After", { "retry-after": "not-a-date" }, 5000],
  ["negative Retry-After", { "retry-after": "-1" }, 5000],
  ["overflow Retry-After", { "retry-after": "1e999" }, 5000],
  ["empty headers", {}, 5000],
] as [string, Record<string, string>, number][]) {
  test(`${name} is honored when every key is cooling down`, async () => {
    const h = harness([limited(headers), ready]);
    assert.equal((await h.api.fetchJupiterBuild(params, "")).status, 200);
    assert.deepEqual(
      h.calls.map((call) => call.at),
      [0, delay],
    );
    assert.deepEqual(h.waits, [delay]);
    assert.deepEqual(h.timeouts, [15000, 15000 - delay]);
  });
}

test("when all keys are cooling, choose the earliest permitted slot rather than the earliest prior request", async () => {
  const h = harness(
    [limited({ "retry-after": "6" }), limited({ "retry-after": "3" }), ready],
    "first,second",
  );
  assert.equal((await h.api.fetchJupiterBuild(params, "")).status, 200);
  assert.deepEqual(h.calls, [
    { key: "first", at: 0 },
    { key: "second", at: 0 },
    { key: "second", at: 3000 },
  ]);
});

test("a provider cooldown beyond the total 15-second budget fails without early retry or long sleep", async () => {
  const h = harness([limited({ "retry-after": "60" })]);
  await assert.rejects(
    h.api.fetchJupiterBuild(params, ""),
    (error: unknown) =>
      error instanceof h.api.JupiterBuildError && error.kind === "rate-limited",
  );
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.waits, []);
});

test("duplicate configured keys do not multiply the retry budget", async () => {
  const h = harness(
    [limited({ "retry-after": "1" }), limited({ "retry-after": "1" })],
    "same, same",
  );
  await assert.rejects(
    h.api.fetchJupiterBuild(params, ""),
    (error: unknown) =>
      error instanceof h.api.JupiterBuildError && error.kind === "rate-limited",
  );
  assert.deepEqual(h.calls, [
    { key: "same", at: 0 },
    { key: "same", at: 1250 },
  ]);
});

test("network and timeout failures cannot expose provider URLs or credentials", async () => {
  const h = harness([
    async () => {
      throw new Error(privateDetail);
    },
  ]);
  await assert.rejects(
    h.api.fetchJupiterBuild(params, ""),
    (error: unknown) => {
      assert.ok(error instanceof h.api.JupiterBuildError);
      assert.equal(error.kind, "unavailable");
      assert.doesNotMatch(error.message, /never-expose-this|provider.invalid/);
      return true;
    },
  );
});
