import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair } from "@solana/web3.js";
import * as sdk from "@kite/sdk";
import { createRouteHealthCache } from "../lib/server/route-health-cache";
import type * as service from "../lib/server/basket-route-health";

const require = createRequire(import.meta.url);
const mints = [
  Keypair.generate().publicKey.toBase58(),
  Keypair.generate().publicKey.toBase58(),
];
const allocations = mints.map((mint) => ({ mint, weightBps: 5000 }));
const input = {
  inputMint: sdk.MAINNET_USDC_MINT,
  amount: "30",
  slippageBps: 100,
  allocations,
};

function fixture(
  options: {
    failure?: number;
    malformed?: boolean;
    networkFailure?: boolean;
    halted?: boolean;
    production?: boolean;
    curated?: boolean;
    theme?: boolean;
  } = {},
) {
  const calls: URLSearchParams[] = [];
  let now = Date.now();
  let networkReads = 0;
  const market = {
    assets: mints.map((mint, index) => ({
      mint,
      symbol: `TEST${index}`,
      underlyingSymbol: options.theme ? ["XOM", "CVX"][index] : `TEST${index}`,
      verified: true,
      tradingHalted: options.halted && index === 1,
      priceUsd: 100,
      liquidityUsd: null,
      issuer: "xstocks",
    })),
  };
  const exports = {} as typeof service;
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("../lib/server/basket-route-health.ts", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      URLSearchParams,
      Date: { now: () => now },
      process: {
        env: {
          NODE_ENV: options.production ? "production" : "test",
          JUPITER_API_KEY: "fixture-key",
        },
      },
      require: (name: string) => {
        if (name === "@kite/sdk")
          return options.curated
            ? {
                ...sdk,
                resolveAllMarketBaskets: () => [
                  {
                    id: "fixture-default",
                    available: true,
                    missingSymbols: [],
                    assets: market.assets.map((asset) => ({
                      asset,
                      weight: 5000,
                    })),
                  },
                ],
              }
            : sdk;
        if (name === "@solana/web3.js" || name === "node:crypto")
          return require(name);
        if (name === "./route-health-cache")
          return {
            createRouteHealthCache: (
              storage: Parameters<typeof createRouteHealthCache>[0],
            ) => createRouteHealthCache(storage, () => now),
          };
        if (name === "./redis")
          return {
            isRedisConfigured: () => false,
            executeRedisCommand: async () => null,
          };
        if (name === "./markets")
          return { getServerMarkets: async () => market };
        if (name === "./creator-store")
          return {
            resolvePublishedCreatorBasket: async () => ({ allocations }),
          };
        if (name === "./composed-transactions")
          return {
            assertMainnet: async () => {
              networkReads++;
              if (options.networkFailure) throw new Error("Wrong genesis");
            },
          };
        if (name === "./jupiter-build")
          return {
            fetchJupiterQuote: async (params: URLSearchParams) => {
              calls.push(params);
              if (options.failure && params.get("outputMint") === mints[1])
                return Response.json(
                  { errorCode: "NO_ROUTES_FOUND" },
                  { status: options.failure },
                );
              return Response.json(
                {
                  inputMint: params.get("inputMint"),
                  outputMint: params.get("outputMint"),
                  inAmount: params.get("amount"),
                  outAmount: "10000",
                  otherAmountThreshold: "9900",
                  swapMode: "ExactIn",
                  slippageBps: options.malformed
                    ? 300
                    : Number(params.get("slippageBps")),
                  routePlan: [
                    {
                      swapInfo: {
                        inputMint: params.get("inputMint"),
                        outputMint: params.get("outputMint"),
                      },
                    },
                  ],
                },
                { headers: { "x-kite-route-max-accounts": "48" } },
              );
            },
          };
        throw new Error(`Unexpected import: ${name}`);
      },
    },
  );
  return {
    service: exports,
    calls,
    networkReads: () => networkReads,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("preflight conserves exact allocations, reports the probe band and reuses observations", async () => {
  const h = fixture();
  const result = await h.service.getBasketRouteHealth(input);
  assert.equal(result.legs.length, 2);
  assert.equal(
    result.legs.reduce(
      (sum, leg) => sum + BigInt(leg.allocatedAmount),
      BigInt(0),
    ),
    BigInt(30_000_000),
  );
  assert.ok(
    result.legs.every(
      (leg) =>
        leg.status === "routable" &&
        leg.probeAmount === "25000000" &&
        leg.maxAccounts === 48 &&
        leg.liquidityUsd === null,
    ),
  );
  assert.equal(h.networkReads(), 1);
  assert.equal(h.calls.length, 2);
  await h.service.getBasketRouteHealth({ ...input, amount: "35" });
  assert.equal(h.calls.length, 2);
  assert.equal(result.advisory, true);
  assert.equal("transaction" in result, false);
  assert.equal("authorization" in result, false);
});

test("every leg is reported and a provider outage cannot be mistaken for no route", async () => {
  for (const status of [400, 503]) {
    const h = fixture({ failure: status });
    const result = await h.service.getBasketRouteHealth(input);
    assert.equal(result.legs[0].status, "routable");
    assert.equal(
      result.legs[1].status,
      status === 400 ? "no-route" : "unknown",
    );
    assert.equal(result.legs.length, allocations.length);
  }
});

test("invalid quote and wrong genesis remain unknown", async () => {
  for (const options of [{ malformed: true }, { networkFailure: true }]) {
    const h = fixture(options);
    const result = await h.service.getBasketRouteHealth(input);
    assert.ok(result.legs.every((leg) => leg.status === "unknown"));
    if (options.networkFailure) assert.equal(h.calls.length, 0);
  }
});

test("production without shared coordination never calls Jupiter", async () => {
  const h = fixture({ production: true });
  const result = await h.service.getBasketRouteHealth(input);
  assert.ok(result.legs.every((leg) => leg.status === "unknown"));
  assert.equal(h.calls.length, 0);
});

test("halted assets report unavailable without losing the allocation", async () => {
  const h = fixture({ halted: true });
  const result = await h.service.getBasketRouteHealth(input);
  assert.equal(result.legs[1].status, "unavailable");
  assert.equal(result.legs[1].allocatedAmount, "15000000");
  assert.equal(h.calls.length, 1);
});

test("invalid weights, dust, unsupported funding and published overrides fail before provider calls", async () => {
  const h = fixture();
  for (const request of [
    {
      ...input,
      allocations: allocations.map((value) => ({ ...value, weightBps: 100 })),
    },
    { ...input, amount: "0.000001" },
    { ...input, inputMint: mints[0] },
    { ...input, basketId: "creator-fixture" },
  ])
    await assert.rejects(h.service.getBasketRouteHealth(request));
  assert.equal(h.calls.length, 0);
});

test("default curation needs fresh sustained coverage from every funding token", async () => {
  const h = fixture({ curated: true });
  assert.equal((await h.service.getBasketRouteCoverage())[0].featured, false);
  for (let sample = 0; sample < 3; sample++) {
    await Promise.all(
      [sdk.MAINNET_USDC_MINT, sdk.MAINNET_USDT_MINT, sdk.MAINNET_SOL_MINT].map(
        (inputMint) =>
          h.service.getBasketRouteHealth({
            ...input,
            inputMint,
            amount: inputMint === sdk.MAINNET_SOL_MINT ? "0.2" : "50",
          }),
      ),
    );
    assert.equal(
      (await h.service.getBasketRouteCoverage())[0].featured,
      sample === 2,
    );
    if (sample < 2) h.advance(300_000);
  }
  const coverage = (await h.service.getBasketRouteCoverage())[0];
  assert.ok(
    coverage.funding.every((value) => value.routable === 2 && value.consistent),
  );
  h.advance(300_001);
  assert.equal((await h.service.getBasketRouteCoverage())[0].featured, false);
});

test("themes outside the four-basket shortlist support route health and cached coverage", async () => {
  const h = fixture({ theme: true });
  const result = await h.service.getBasketRouteHealth({
    inputMint: sdk.MAINNET_USDC_MINT,
    amount: "30",
    slippageBps: 100,
    basketId: "sol-energy",
  });
  assert.equal(result.legs.length, 2);
  assert.ok(result.legs.every((leg) => leg.status === "routable"));
  assert.ok(
    (await h.service.getBasketRouteCoverage()).some(
      (basket) => basket.basketId === "sol-energy",
    ),
  );
});
