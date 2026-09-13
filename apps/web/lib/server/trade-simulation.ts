import { Connection, PublicKey } from "@solana/web3.js";
import {
  simulateTradeOrder,
  type MainnetTradeOrder,
  type TradeSimulationResult,
} from "@kite/sdk";

/** Read-only mainnet preflight before asking the user to sign. Provider details stay server-side. */
export async function preflightMainnetOrder(
  order: Pick<MainnetTradeOrder, "transaction" | "taker">,
): Promise<TradeSimulationResult> {
  try {
    const endpoint =
      process.env.SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.mainnet-beta.solana.com";
    const signal = AbortSignal.timeout(10_000);
    const connection = new Connection(endpoint, {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
      fetch: (input, init) => fetch(input, { ...init, signal }),
    });
    if (
      (await connection.getGenesisHash()) !==
      "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
    )
      throw new Error("Mainnet RPC required");
    const result = await simulateTradeOrder(
      connection,
      order,
      new PublicKey(order.taker),
      { signal },
    );
    return {
      ...result,
      error:
        result.status === "passed"
          ? null
          : result.status === "failed"
            ? "This quote did not pass mainnet simulation. Refresh the quote before signing."
            : "Mainnet preflight is unavailable. Try again or check the server RPC configuration.",
    };
  } catch {
    return {
      status: "unavailable",
      unitsConsumed: null,
      error:
        "Mainnet preflight is unavailable. Try again or check the server RPC configuration.",
    };
  }
}
