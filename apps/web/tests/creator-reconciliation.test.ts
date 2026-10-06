import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { reconcileInBatches } from "../lib/server/creator-reconciliation";
import { withinRecurringDeadline } from "../lib/server/devnet-connection";

test("creator verification scales past 100 plans with at most two simultaneous 100-plan batches", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => index);
  let active = 0,
    peak = 0;
  const sizes: number[] = [];
  const result = await withinRecurringDeadline(Date.now() + 1000, () =>
    reconcileInBatches(rows, async (batch) => {
      sizes.push(batch.length);
      active++;
      peak = Math.max(peak, active);
      await delay(1);
      active--;
      return batch.filter((row) => row % 2 === 0);
    }),
  );
  assert.equal(peak, 2);
  assert.deepEqual(sizes, [100, 100, 100, 100, 100, 1]);
  assert.deepEqual(
    result,
    rows.filter((row) => row % 2 === 0),
  );
});

test("creator verification rejects incomplete or timed-out passes without returning partial counters", async () => {
  let settled = false;
  await assert.rejects(
    () =>
      withinRecurringDeadline(Date.now() + 1000, () =>
        reconcileInBatches(
          Array.from({ length: 201 }, (_, i) => i),
          async (batch) => {
            if (batch[0] === 0) throw new Error("RPC unavailable");
            await delay(1);
            settled = true;
            return batch;
          },
        ),
      ),
    /RPC unavailable/,
  );
  assert.equal(settled, true);
  let called = false;
  await assert.rejects(
    () =>
      withinRecurringDeadline(Date.now() - 1, () =>
        reconcileInBatches([1], async (batch) => {
          called = true;
          return batch;
        }),
      ),
    /time limit/,
  );
  assert.equal(called, false);
});
