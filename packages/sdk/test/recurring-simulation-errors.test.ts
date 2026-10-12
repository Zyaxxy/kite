import assert from "node:assert/strict";
import test from "node:test";
import { describeRecurringSimulationFailure } from "../src/simulation-errors";

const guard = "8Fm9HENPAFnyo6L8cHJFx62HHsZ6ez6CPUDuzgKAzrjs";
const token = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const system = "11111111111111111111111111111111";
const custom = (code: number) => ({ InstructionError: [5, { Custom: code }] });
const failed = (program: string, code: number) => [
  `Program ${program} invoke [1]`,
  `Program ${program} failed: custom program error: 0x${code.toString(16)}`,
];

test("missing Guard instruction reports the contract mismatch, not insufficient funds", () => {
  const message = describeRecurringSimulationFailure(
    custom(101),
    failed(guard, 101),
  );
  assert.match(message, /Upgrade the devnet Guard/);
  assert.match(message, /Adding SOL or KUSD will not fix/);
  assert.doesNotMatch(message, /pool liquidity/);
});

test("unscoped, earlier, mismatched and downstream error codes cannot diagnose a Guard mismatch", () => {
  for (const logs of [
    undefined,
    failed(system, 101),
    failed(guard, 102),
    [...failed(guard, 101), ...failed(token, 101)],
    [
      `Program ${guard} invoke [1]`,
      ...failed(token, 101).map((line) => line.replace("[1]", "[2]")),
      `Program ${guard} failed: custom program error: 0x65`,
    ],
  ]) {
    const message = describeRecurringSimulationFailure(custom(101), logs);
    assert.match(message, /instruction 6, program error 101/);
    assert.doesNotMatch(message, /contract mismatch|Upgrade/);
  }
});

test("devnet failures distinguish SOL rent, test token funds and expired blockhashes", () => {
  for (const [error, logs] of [
    ["InsufficientFundsForFee", undefined],
    [{ InsufficientFundsForRent: { account_index: 1 } }, undefined],
    [custom(1), failed(system, 1)],
  ])
    assert.match(describeRecurringSimulationFailure(error, logs), /devnet SOL/);
  assert.match(
    describeRecurringSimulationFailure(custom(1), failed(token, 1)),
    /test KUSD balance and delegated allowance/,
  );
  assert.match(
    describeRecurringSimulationFailure("BlockhashNotFound"),
    /blockhash expired/,
  );
  const unknown = describeRecurringSimulationFailure(
    { endpoint: "provider-secret" },
    ["provider-secret"],
  );
  assert.doesNotMatch(unknown, /provider-secret|liquidity/);
});
