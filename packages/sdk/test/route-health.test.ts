import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyJupiterRouteError,
  routeProbeAmount,
} from "../src/basket/route-health";
import { KiteClient } from "../src/client/kite-client";

test("finite amount bands round up in exact raw funding units", () => {
  assert.equal(routeProbeAmount(25_000_000n, 6), "25000000");
  assert.equal(routeProbeAmount(25_000_001n, 6), "50000000");
  assert.equal(routeProbeAmount(1n, 6), "1000000");
  assert.equal(routeProbeAmount(100_000_001n, 9), "250000000");
  assert.throws(() => routeProbeAmount(0n, 6));
  assert.throws(() => routeProbeAmount(100_000_000_001n, 6), /exceeds/);
});

test("provider errors never infer illiquidity from unknown failures", () => {
  assert.equal(
    classifyJupiterRouteError(400, { errorCode: "NO_ROUTES_FOUND" }),
    "no-route",
  );
  assert.equal(
    classifyJupiterRouteError(400, { error: "No routes found" }),
    "no-route",
  );
  assert.equal(
    classifyJupiterRouteError(400, {
      errorCode: "ROUTE_PLAN_DOES_NOT_CONSUME_ALL_THE_AMOUNT",
    }),
    "liquidity",
  );
  assert.equal(
    classifyJupiterRouteError(400, {
      errorCode: "MAX_ACCOUNT_GREATER_THAN_MAX",
    }),
    "capacity",
  );
  assert.equal(
    classifyJupiterRouteError(400, { errorCode: "TOKEN_NOT_TRADABLE" }),
    "unavailable",
  );
  for (const status of [401, 403, 429, 500, 503]) {
    assert.equal(
      classifyJupiterRouteError(status, { errorCode: "NO_ROUTES_FOUND" }),
      "unknown",
    );
  }
  assert.equal(
    classifyJupiterRouteError(400, { error: "Could not get pool liquidity" }),
    "unknown",
  );
  assert.equal(classifyJupiterRouteError(400, null), "unknown");
});

test("shared web/native transport rejects a wrong allocation or malformed health response", async () => {
  const input = {
    inputMint: "input",
    amount: "30",
    slippageBps: 100,
    allocations: [
      { mint: "one", weightBps: 5000 },
      { mint: "two", weightBps: 5000 },
    ],
  };
  const health = {
    network: "mainnet-beta",
    inputMint: "input",
    inputSymbol: "USDC",
    inputDecimals: 6,
    amount: "30",
    slippageBps: 100,
    advisory: true,
    legs: ["one", "two"].map((mint) => ({
      mint,
      symbol: mint,
      allocatedAmount: "15000000",
      probeAmount: "25000000",
      status: "routable",
      checkedAt: 1000,
      expiresAt: 301000,
      maxAccounts: 32,
      consistent: false,
      liquidityUsd: null,
      detail: "Observed route",
    })),
  };
  let response: unknown = health;
  const client = new KiteClient({
    fetcher: async () => Response.json(response),
  });
  assert.equal((await client.requestBasketRouteHealth(input)).legs.length, 2);
  for (const invalid of [
    { ...health, inputMint: "different" },
    { ...health, network: "devnet" },
    { ...health, inputDecimals: 500 },
    { ...health, legs: health.legs.slice(0, 1) },
    { ...health, legs: [...health.legs].reverse() },
    {
      ...health,
      legs: health.legs.map((leg) => ({ ...leg, status: "illiquid" })),
    },
    {
      ...health,
      legs: health.legs.map((leg) => ({ ...leg, probeAmount: "invalid" })),
    },
  ]) {
    response = invalid;
    await assert.rejects(
      client.requestBasketRouteHealth(input),
      /invalid response/,
    );
  }
});
