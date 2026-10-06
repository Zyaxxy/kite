import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "../lib/server/request-policy";
import { RpcError } from "../lib/server/composed-transactions";

test("a receipt RPC rejection after acknowledged single broadcast stays Unknown and preserves the signature", async () => {
  const code = ts.transpileModule(
    readFileSync("apps/web/app/api/transaction/execute/route.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const signature = "1".repeat(88);
  const calls: string[] = [];
  const exports = {} as {
    POST: (request: NextRequest) => Promise<NextResponse>;
  };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextRequest, NextResponse },
    "@kite/sdk": { UNKNOWN_TRADE_MESSAGE: "Confirmation is unknown." },
    "@/lib/server/request-policy": { readLimitedJson },
    "@/lib/server/basket-receipts": {
      recordConfirmedBasketReceipt: async () =>
        assert.fail("Unconfirmed receipts cannot award points."),
    },
    "@/lib/server/composed-transactions": {
      assertMainnet: async () => {},
      mainnetV1Active: async () => true,
      verifyComposed: async () => ({
        version: 0,
        lastValidBlockHeight: 100,
        taker: "wallet",
      }),
      mainnetRpc: async (method: string) => {
        calls.push(method);
        if (method === "getBlockHeight") return 50;
        if (method === "sendTransaction") return signature;
        throw new RpcError("Receipt provider unavailable");
      },
    },
  };
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
    Error,
    setTimeout,
  });
  const response = await exports.POST(
    new NextRequest("https://kite.example/api/transaction/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signedTransaction: "signed",
        authorization: "reviewed",
      }),
    }),
  );
  const result = await response.json();
  assert.equal(result.status, "Unknown");
  assert.equal(result.signature, signature);
  assert.deepEqual(calls, [
    "getBlockHeight",
    "sendTransaction",
    "getSignatureStatuses",
  ]);
});
