import assert from "node:assert/strict";
import test from "node:test";
import { describeSimulationFailure } from "../src/simulation-errors";
import {
  describeRouteFailure,
  routeHealthGuidance,
  type BasketRouteHealth,
  type RouteHealthStatus,
} from "../src/basket/route-health";

const jupiter = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const other = "11111111111111111111111111111111";
const custom = (code: number) => ({ InstructionError: [3, { Custom: code }] });
const failed = (program: string, code: number) => [
  `Program ${program} invoke [1]`,
  `Program ${program} failed: custom program error: 0x${code.toString(16)}`,
];

test("simulation distinguishes SOL fees/rent, funding balance, slippage, expiration and limits", () => {
  assert.match(
    describeSimulationFailure("InsufficientFundsForFee"),
    /Not enough SOL/,
  );
  assert.match(
    describeSimulationFailure(custom(1), failed(other, 1)),
    /any SOL purchase amount/,
  );
  assert.match(
    describeSimulationFailure({
      InsufficientFundsForRent: { account_index: 1 },
    }),
    /token-account rent/,
  );
  assert.match(
    describeSimulationFailure(custom(6024), failed(jupiter, 6024)),
    /insufficient funds/,
  );
  assert.match(
    describeSimulationFailure(custom(6001), failed(jupiter, 6001)),
    /selected slippage/,
  );
  assert.match(
    describeSimulationFailure(custom(6017), failed(jupiter, 6017)),
    /Slippage was not changed/,
  );
  assert.match(
    describeSimulationFailure("BlockhashNotFound"),
    /Refresh the review/,
  );
  assert.match(
    describeSimulationFailure({
      InstructionError: [1, "ComputationalBudgetExceeded"],
    }),
    /compute limit/,
  );
  assert.match(
    describeSimulationFailure("TooManyAccountLocks"),
    /account or data limits/,
  );
  assert.match(
    describeSimulationFailure(custom(6025), failed(jupiter, 6025)),
    /missing or incompatible/,
  );
});

test("unscoped, mismatched and CPI custom codes never falsely claim Jupiter slippage or illiquidity", () => {
  for (const logs of [
    undefined,
    failed(other, 6001),
    failed(jupiter, 6024),
    [
      `Program ${jupiter} invoke [1]`,
      ...failed(other, 6001).map((line) => line.replace("[1]", "[2]")),
      `Program ${jupiter} failed: custom program error: 0x1771`,
    ],
  ]) {
    const message = describeSimulationFailure(custom(6001), logs);
    assert.match(message, /instruction 4, program error 6001/);
    assert.match(message, /liquidity is unknown/);
    assert.doesNotMatch(message, /selected slippage|insufficient funds/);
  }
});

test("earlier failures and raw provider log details do not leak into the final error", () => {
  const logs = [
    ...failed(jupiter, 6001),
    ...failed(other, 6001),
    "secret-provider-details",
  ];
  assert.match(
    describeSimulationFailure(custom(6001), logs),
    /liquidity is unknown/,
  );
  assert.doesNotMatch(
    describeSimulationFailure(
      { privateEndpoint: "secret-provider-details" },
      logs,
    ),
    /secret-provider-details/,
  );
});

test("exact no-route errors name the stock and offer other funding tokens, not automatic slippage", () => {
  const message = describeRouteFailure("no-route", "USDC", "AAPLx");
  assert.match(message, /No Jupiter route from USDC to AAPLx/);
  assert.match(message, /Try paying with USDT or SOL/);
  assert.match(message, /No assets will be skipped/);
  assert.match(
    describeRouteFailure("no-route", "SOL", "AAPLx"),
    /Try paying with USDC or USDT/,
  );
  assert.match(
    describeRouteFailure("liquidity", "USDC", "AAPLx"),
    /Slippage will not be increased automatically/,
  );
  assert.match(
    describeRouteFailure("unknown", "USDC", "AAPLx"),
    /temporarily unknown/,
  );
});

function health(statuses: RouteHealthStatus[]): BasketRouteHealth {
  return {
    network: "mainnet-beta",
    inputMint: "input",
    inputSymbol: "USDC",
    inputDecimals: 6,
    amount: "100",
    slippageBps: 100,
    advisory: true,
    legs: statuses.map((status, i) => ({
      mint: `mint${i}`,
      symbol: `STOCK${i}`,
      status,
      checkedAt: 1000,
      expiresAt: 2000,
      detail: "probe",
      probeAmount: "25000000",
      allocatedAmount: "25000000",
      maxAccounts: null,
      consistent: false,
      liquidityUsd: null,
    })),
  };
}

test("cached guidance preserves mixed categories and stale or unknown data remains advisory", () => {
  const value = health(["no-route", "liquidity", "unknown"]);
  const guidance = routeHealthGuidance(value, 1500)!;
  assert.match(guidance, /Cached amount-band check/);
  assert.match(guidance, /No Jupiter route from USDC to STOCK0/);
  assert.match(guidance, /STOCK1 cannot fill/);
  assert.doesNotMatch(guidance, /STOCK2 cannot fill/);
  assert.match(routeHealthGuidance(value, 2001)!, /stale/);
  assert.match(
    routeHealthGuidance(health(["unknown"]), 1500)!,
    /temporarily unknown/,
  );
  assert.equal(routeHealthGuidance(health(["routable"]), 1500), null);
  assert.equal(routeHealthGuidance(null), null);
});
