import { Buffer } from "buffer";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { MainnetTradeOrder } from "./trading";

class SimulationInputError extends Error {}

export interface TradeSimulationResult {
  status: "passed" | "failed" | "unavailable";
  unitsConsumed: number | null;
  error: string | null;
}

/** Read-only preflight. Success is an observation, never a guarantee of execution. */
export async function simulateTradeOrder(
  connection: Pick<Connection, "simulateTransaction">,
  order: Pick<MainnetTradeOrder, "transaction" | "taker">,
  userPubkey: PublicKey,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<TradeSimulationResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    if (order.taker !== userPubkey.toBase58())
      throw new SimulationInputError("Quote wallet does not match the signer.");
    const bytes = Buffer.from(order.transaction, "base64");
    if (!bytes.length || bytes.length > 1232)
      throw new SimulationInputError("Unsupported transaction size.");
    const transaction = VersionedTransaction.deserialize(bytes);
    const signers = transaction.message.staticAccountKeys.slice(
      0,
      transaction.message.header.numRequiredSignatures,
    );
    if (!signers.some((key) => key.equals(userPubkey)))
      throw new SimulationInputError(
        "The wallet is not a required transaction signer.",
      );
    const timeoutMs = options.timeoutMs ?? 8_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000)
      throw new SimulationInputError("Invalid simulation timeout.");
    if (options.signal?.aborted)
      throw new SimulationInputError("Simulation cancelled.");
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new SimulationInputError("Simulation service timed out.")),
        timeoutMs,
      );
      abort = () => reject(new SimulationInputError("Simulation cancelled."));
      options.signal?.addEventListener("abort", abort, { once: true });
    });
    // No signature verification because the taker has not approved yet. Preserve the
    // original transaction: changing a sponsored blockhash invalidates its signature.
    const result = await Promise.race([
      connection.simulateTransaction(transaction, {
        sigVerify: false,
        replaceRecentBlockhash: false,
        commitment: "confirmed",
      }),
      deadline,
    ]);
    if (!result?.value || !("err" in result.value))
      throw new SimulationInputError(
        "Simulation service returned an invalid response.",
      );
    return {
      status: result.value.err === null ? "passed" : "failed",
      unitsConsumed:
        typeof result.value.unitsConsumed === "number"
          ? result.value.unitsConsumed
          : null,
      error:
        result.value.err === null
          ? null
          : "This quote did not pass on-chain simulation. Refresh the quote before signing.",
    };
  } catch (error) {
    return {
      status: "unavailable",
      unitsConsumed: null,
      error:
        error instanceof SimulationInputError
          ? error.message
          : "Simulation service is unavailable. Refresh the quote and try again.",
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) options.signal?.removeEventListener("abort", abort);
  }
}
