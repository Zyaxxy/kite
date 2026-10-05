import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateBasketInput,
  basketInputDebitBounds,
  validateBasketInputDebit,
} from "../src/basket/atomic-swap";

test("20,000 reviewed units can settle for 19,999 or 19,989 without overspending", () => {
  assert.equal(validateBasketInputDebit(20_000n, 19_999n), 1n);
  assert.equal(validateBasketInputDebit(20_000n, 19_989n), 11n);
  assert.equal(validateBasketInputDebit(20_000n, 20_000n), 0n);
});

test("Hare allocations conserve the full budget before settlement dust", () => {
  const legs = allocateBasketInput(20_000n, [
    { mint: "a", weightBps: 3334 },
    { mint: "b", weightBps: 3333 },
    { mint: "c", weightBps: 3333 },
  ]);
  assert.deepEqual(
    legs.map((leg) => leg.amount),
    [6668n, 6666n, 6666n],
  );
  assert.equal(
    legs.reduce((sum, leg) => sum + leg.amount, 0n),
    20_000n,
  );
  assert.equal(validateBasketInputDebit(20_000n, 19_989n), 11n);
});

test("debits are bounded to 50 units above and 100 units below the allocation", () => {
  assert.deepEqual(basketInputDebitBounds(20_000n), {
    minimum: 19_900n,
    maximum: 20_050n,
  });
  assert.equal(validateBasketInputDebit(2_000_000n, 1_999_997n), 3n);
  assert.equal(validateBasketInputDebit(20_000n, 19_900n), 100n);
  assert.equal(validateBasketInputDebit(20_000n, 20_050n), -50n);
  assert.throws(() => validateBasketInputDebit(20_000n, 19_899n));
  assert.throws(() => validateBasketInputDebit(20_000n, 20_051n));
  assert.equal(validateBasketInputDebit(9999n, 9998n), 1n);
});

test("out-of-range spending, zero and negative debits remain invalid", () => {
  for (const spent of [20_051n, 19_899n, 10_000n, 0n, -1n])
    assert.throws(() => validateBasketInputDebit(20_000n, spent));
  for (const reviewed of [0n, -1n, 1n << 64n])
    assert.throws(() => validateBasketInputDebit(reviewed, 1n));
});

test("debit validation keeps u64 precision without Number conversion", () => {
  const reviewed = (1n << 64n) - 1n;
  assert.equal(validateBasketInputDebit(reviewed, reviewed - 13n), 13n);
  assert.throws(() => validateBasketInputDebit(reviewed, reviewed + 1n));
  assert.throws(() => validateBasketInputDebit(reviewed + 1n, 1n));
  assert.deepEqual(basketInputDebitBounds(reviewed), {
    minimum: reviewed - 100n,
    maximum: reviewed,
  });
  assert.deepEqual(basketInputDebitBounds(1n), { minimum: 1n, maximum: 51n });
});
