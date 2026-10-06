import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";
import * as requestPolicy from "../lib/server/request-policy";
import * as sdk from "@kite/sdk";

const require = createRequire(import.meta.url);
function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      URL,
      process: { env: { NODE_ENV: "development" } },
      require: (name: string) =>
        name === "next/server" ? require(name) : dependencies[name],
    },
  );
  return exports as T;
}

test("only bundle execution and recovery receive the 32 KiB middleware allowance", () => {
  const { middleware } = load<{
    middleware: (request: NextRequest) => Response;
  }>("../middleware.ts", {
    "./lib/server/request-policy": requestPolicy,
  });
  const request = (path: string, length: number) =>
    new NextRequest(`http://localhost:3000${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(length),
      },
      body: "{}",
    });
  for (const path of ["/api/bundles/execute", "/api/bundles/status"]) {
    assert.equal(middleware(request(path, 32_768)).status, 200);
    assert.equal(middleware(request(path, 32_769)).status, 413);
  }
  assert.equal(middleware(request("/api/trade/execute", 16_385)).status, 413);
});

test("five V1 envelopes pass API limits, but broadcast rechecks activation and keeps uncertain sends unknown", async () => {
  let active = true,
    correctGenesis = true,
    sends = 0,
    loseResponse = false;
  const { POST } = load<{ POST: (request: NextRequest) => Promise<Response> }>(
    "../app/api/bundles/execute/route.ts",
    {
      "@kite/sdk": {
        ...sdk,
        walletTransactionSignature: async (encoded: string) =>
          encoded.slice(-10),
      },
      "@/lib/server/request-policy": requestPolicy,
      "@/lib/server/bundle-authorization": {
        verifyBundle: async () => ({
          taker: "owner",
          transactionVersion: 1,
          lastValidBlockHeight: 100,
          basketId: "basket",
          inputMint: "mint",
          inAmount: "10",
        }),
        authorizeBundleStatus: () => "read-only-receipt",
      },
      "@/lib/server/composed-transactions": {
        assertMainnet: async () => {
          if (!correctGenesis) throw new Error("RPC must use mainnet");
        },
        mainnetRpc: async () => 90,
        mainnetV1Active: async () => active,
      },
      "@/lib/server/jito-bundles": {
        sendJitoBundle: async () => {
          sends++;
          if (loseResponse) throw new Error("lost response");
          return "a".repeat(64);
        },
      },
    },
  );
  const request = (count = 5) =>
    new NextRequest("http://localhost:3000/api/bundles/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authorization: "review",
        signedTransactions: Array.from(
          { length: count },
          (_, i) => "A".repeat(5463) + i,
        ),
      }),
    });
  let response = await POST(request());
  assert.equal(response.status, 202);
  assert.equal((await response.json()).status, "Pending");
  assert.equal(sends, 1);
  active = false;
  response = await POST(request());
  assert.equal((await response.json()).status, "Failed");
  assert.equal(sends, 1);
  active = true;
  correctGenesis = false;
  response = await POST(request());
  assert.equal((await response.json()).status, "Failed");
  assert.equal(sends, 1);
  correctGenesis = true;
  loseResponse = true;
  response = await POST(request());
  const unknown = await response.json();
  assert.equal(unknown.status, "Unknown");
  assert.equal(unknown.signatures.length, 5);
  assert.equal(unknown.statusAuthorization, "read-only-receipt");
  assert.equal(sends, 2);
  response = await POST(request(6));
  assert.equal(response.status, 422);
  assert.equal(sends, 2);
});

test("basket API admits twelve allocations and rejects thirteen before provider work", async () => {
  let preparations = 0;
  const { POST } = load<{ POST: (request: NextRequest) => Promise<Response> }>(
    "../app/api/buy-basket/route.ts",
    {
      "@kite/sdk": sdk,
      "@/lib/server/request-policy": requestPolicy,
      "@/lib/server/basket-order": {
        prepareBasketOrder: async (body: sdk.BasketOrderRequest) => {
          preparations++;
          assert.equal(body.customAllocations?.length, 12);
          return { reviewed: true };
        },
      },
    },
  );
  const request = (count: number) =>
    new NextRequest("http://localhost:3000/api/buy-basket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        basketId: "custom",
        taker: "owner",
        inputMint: "mint",
        amount: "100",
        slippageBps: 100,
        supportedTransactionVersions: [0, 1],
        customAllocations: Array.from({ length: count }, (_, i) => ({
          mint: `mint-${i}`,
          weightBps: Math.floor(10_000 / count) + (i < 10_000 % count ? 1 : 0),
        })),
      }),
    });
  assert.equal((await POST(request(12))).status, 200);
  assert.equal((await POST(request(13))).status, 422);
  assert.equal(preparations, 1);
});
