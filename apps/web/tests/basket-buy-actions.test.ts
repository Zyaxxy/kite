import test from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { MAINNET_USDC_MINT } from "@kite/sdk";
import {
  parseBasketBuyAction,
  basketBuyActionMetadata,
} from "../lib/server/basket-buy-actions";
import { actionHeaders } from "../lib/server/recurring-actions";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";
import * as requestPolicy from "../lib/server/request-policy";
import * as sdk from "@kite/sdk";

const owner = Keypair.generate().publicKey.toBase58();
test("purchase inputs bind USDC, V0 and slippage and reject allocation/network overrides", () => {
  const parse = (query: string, body: unknown = { account: owner }) =>
    parseBasketBuyAction(
      "creator-fc7810dce6101c2af873c861",
      new URLSearchParams(query),
      body,
    );
  const input = parse("amount=1.000001");
  assert.equal(input.inputMint, MAINNET_USDC_MINT);
  assert.equal(input.slippageBps, 100);
  assert.deepEqual(input.supportedTransactionVersions, [0]);
  for (const query of [
    "",
    "amount=0",
    "amount=-1",
    "amount=1e2",
    "amount=1.0000001",
    "amount=18446744073710",
    "amount=1&amount=2",
    "amount=1&cadence=weekly",
    "amount=1&inputMint=other",
  ])
    assert.throws(() => parse(query));
  for (const body of [
    { account: "invalid" },
    { account: owner, allocations: [] },
    { account: owner, data: { amount: "1" } },
    { account: owner, data: [] },
  ])
    assert.throws(() => parse("amount=1", body));
  assert.equal(parse("amount=1", { account: owner, data: {} }).taker, owner);
});
test("purchase metadata and headers distinguish mainnet from recurring devnet", () => {
  const metadata = basketBuyActionMetadata(
    { id: "creator-test", name: "AGI Race" },
    "https://invest.onkite.xyz",
  );
  assert.match(metadata.title, /Mainnet/);
  assert.match(
    metadata.links!.actions[0].href,
    /buy-baskets\/creator-test\?amount=\{amount\}/,
  );
  assert.equal(metadata.links!.actions[0].parameters!.length, 1);
  assert.equal(
    actionHeaders("mainnet")["X-Blockchain-Ids"],
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  );
  assert.equal(
    actionHeaders()["X-Blockchain-Ids"],
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  );
});

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
test("Action returns the complete single transaction and refuses bundles and preparation failures", async () => {
  let result: unknown = {
    transaction: "complete-unsigned-message",
    inAmount: "1000000",
    inputDecimals: 6,
    outputs: [],
    priorityFeeLamports: 10000,
  };
  const route = load<{
    POST: (request: NextRequest, context: unknown) => Promise<Response>;
    OPTIONS: () => Response;
  }>("../app/api/actions/buy-baskets/[id]/route.ts", {
    "@kite/sdk": sdk,
    "@/lib/server/recurring-actions": {
      actionHeaders,
      actionSiteOrigin: () => "https://invest.onkite.xyz",
    },
    "@/lib/server/basket-buy-actions": {
      parseBasketBuyAction,
      resolveBuyActionBasket: async () => ({ id: "sol-chips" }),
    },
    "@/lib/server/request-policy": requestPolicy,
    "@/lib/server/basket-order": {
      prepareBasketOrder: async (input: unknown) => {
        assert.equal(
          (input as { inputMint: string }).inputMint,
          MAINNET_USDC_MINT,
        );
        if (result instanceof Error) throw result;
        return result;
      },
    },
  });
  const post = () =>
    route.POST(
      new NextRequest(
        "https://invest.onkite.xyz/api/actions/buy-baskets/sol-chips?amount=1",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: owner }),
        },
      ),
      { params: Promise.resolve({ id: "sol-chips" }) },
    );
  assert.equal(route.OPTIONS().status, 204);
  const success = await post();
  assert.equal(success.status, 200);
  assert.equal((await success.json()).transaction, "complete-unsigned-message");
  for (const failure of [
    { kind: "bundle", transactions: ["leg-1", "leg-2"] },
    new Error("Simulation failed"),
  ]) {
    result = failure;
    const response = await post();
    assert.equal(response.status, 422);
    assert.equal(
      response.headers.get("X-Blockchain-Ids"),
      actionHeaders("mainnet")["X-Blockchain-Ids"],
    );
    assert.equal((await response.json()).transaction, undefined);
  }
});
test("middleware error and OPTIONS headers follow the Action network", () => {
  const { middleware } = load<{
    middleware: (request: NextRequest) => Response;
  }>("../middleware.ts", {
    "./lib/server/request-policy": requestPolicy,
  });
  for (const [path, network] of [
    ["buy-baskets", "mainnet"],
    ["baskets", "devnet"],
  ] as const) {
    for (const method of ["OPTIONS", "POST"]) {
      const response = middleware(
        new NextRequest(`http://localhost:3000/api/actions/${path}/sol-chips`, {
          method,
        }),
      );
      assert.equal(response.status, method === "OPTIONS" ? 204 : 415);
      assert.equal(
        response.headers.get("X-Blockchain-Ids"),
        actionHeaders(network)["X-Blockchain-Ids"],
      );
    }
  }
});
