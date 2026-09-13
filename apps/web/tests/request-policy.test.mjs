import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const compile = (path) =>
  ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
function policy() {
  const exports = {};
  runInNewContext(compile("../lib/server/request-policy.ts"), {
    exports,
    TextDecoder,
    Uint8Array,
  });
  return exports;
}
function middleware(env = {}) {
  const exports = {};
  runInNewContext(compile("../middleware.ts"), {
    exports,
    URL,
    process: { env },
    require: (name) => (name === "next/server" ? require(name) : policy()),
  });
  return exports.middleware;
}
test("CORS allows configured browser origins and native requests, never wildcard origins", () => {
  const fn = middleware({ NODE_ENV: "development" });
  const response = fn(
    new NextRequest("http://localhost:3000/api/markets", {
      method: "OPTIONS",
      headers: { origin: "http://localhost:8081" },
    }),
  );
  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://localhost:8081",
  );
  assert.match(response.headers.get("access-control-expose-headers"), /ETag/);
  assert.equal(
    fn(
      new NextRequest("http://localhost:3000/api/markets", {
        headers: { origin: "https://unknown.example" },
      }),
    ).status,
    403,
  );
  assert.equal(
    fn(new NextRequest("http://localhost:3000/api/markets")).status,
    200,
  );
});
test("HTTPS redirects only to configured canonical host and ignores untrusted proxy headers", () => {
  const fn = middleware({
    NODE_ENV: "production",
    KITE_SITE_URL: "https://kite.example",
  });
  const response = fn(
    new NextRequest("http://attacker.example/markets?q=a", {
      headers: { "x-forwarded-proto": "https" },
    }),
  );
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    "https://kite.example/markets?q=a",
  );
  assert.equal(
    fn(new NextRequest("http://127.0.0.1:3000/api/health")).status,
    200,
  );
});
test("request limiter bounds both quotas and key cardinality", () => {
  const limit = policy().createRequestLimiter(2, 1000, 2);
  assert.equal(limit("a", 1), 0);
  assert.equal(limit("a", 2), 0);
  assert.equal(limit("a", 3), 1);
  assert.equal(limit("b", 4), 0);
  assert.equal(limit("c", 5), 1);
  assert.equal(limit("c", 1002), 0);
});
test("chunked JSON bodies cannot bypass size checks", async () => {
  const { readLimitedJson } = policy();
  const request = new Request("http://localhost/", {
    method: "POST",
    body: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"x":"'));
        c.enqueue(new TextEncoder().encode("a".repeat(100)));
        c.close();
      },
    }),
    duplex: "half",
  });
  await assert.rejects(() => readLimitedJson(request, 32), /too large/);
  const valid = await readLimitedJson(
    new Request("http://localhost/", {
      method: "POST",
      body: '{"amount":"1"}',
    }),
  );
  assert.equal(valid.amount, "1");
});
test("write endpoints require JSON and limit declared payloads", () => {
  const fn = middleware({ NODE_ENV: "development" });
  assert.equal(
    fn(
      new NextRequest("http://localhost:3000/api/trade/order", {
        method: "POST",
        body: "amount=1",
      }),
    ).status,
    415,
  );
  assert.equal(
    fn(
      new NextRequest("http://localhost:3000/api/trade/order", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "20000",
        },
      }),
    ).status,
    413,
  );
});

test("trusted HTTPS termination accepts the public same-origin browser request", () => {
  const fn = middleware({ NODE_ENV: "production", KITE_TRUST_PROXY: "true" });
  const response = fn(
    new NextRequest("http://kite.example/api/markets", {
      headers: {
        origin: "https://kite.example",
        "x-forwarded-proto": "https",
        "x-real-ip": "test",
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://kite.example",
  );
  const preflight = fn(
    new NextRequest("http://kite.example/api/trade/order", {
      method: "OPTIONS",
      headers: { origin: "https://kite.example", "x-forwarded-proto": "https" },
    }),
  );
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("strict-transport-security"), /max-age/);
});
test("invalid canonical URLs fail closed and lookalike JSON media types are rejected", () => {
  for (const KITE_SITE_URL of [
    "https://",
    "https://user:password@kite.example",
  ]) {
    const response = middleware({ NODE_ENV: "production", KITE_SITE_URL })(
      new NextRequest("http://kite.example/api/health"),
    );
    assert.equal(response.status, 503);
  }
  assert.equal(
    middleware({ NODE_ENV: "development" })(
      new NextRequest("http://localhost:3000/api/trade/order", {
        method: "POST",
        headers: { "content-type": "application/jsonp" },
      }),
    ).status,
    415,
  );
});
