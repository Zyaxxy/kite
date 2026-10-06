import { recurringRpcTimeout } from "./devnet-connection";

/** Two workers bound RPC pressure while each account batch stays within Solana's 100-key limit. */
export async function reconcileInBatches<T, R>(
  rows: readonly T[],
  reconcile: (batch: T[]) => Promise<R[]>,
): Promise<R[]> {
  const batches = Array.from(
    { length: Math.ceil(rows.length / 100) },
    (_, index) => rows.slice(index * 100, (index + 1) * 100),
  );
  const results: R[][] = new Array(batches.length);
  let cursor = 0;
  let failed = false;
  const workers = Array.from(
    { length: Math.min(2, batches.length) },
    async () => {
      while (!failed && cursor < batches.length) {
        const index = cursor++;
        try {
          recurringRpcTimeout();
          results[index] = await reconcile(batches[index]);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    },
  );
  // Wait for both bounded requests: no rejected pass leaves a background worker running.
  const settled = await Promise.allSettled(workers);
  for (const result of settled)
    if (result.status === "rejected") throw result.reason;
  recurringRpcTimeout();
  return results.flat();
}
