import { AsyncLocalStorage } from "node:async_hooks";
import { Connection } from "@solana/web3.js";
import { DEVNET_GENESIS_HASH } from "@kite/sdk";

const deadline = new AsyncLocalStorage<number>();

/** This client deliberately never reads the mainnet or browser RPC variables. */
export function getDevnetRpcUrl(): string {
  const url = new URL(
    process.env.KITE_RECURRING_RPC_URL?.trim() ||
      "https://api.devnet.solana.com",
  );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Configure an HTTPS recurring devnet RPC endpoint.");
  }
  return url.toString();
}

export function getDevnetConnection(): Connection {
  return new Connection(getDevnetRpcUrl(), {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
    fetch: (url, options) =>
      fetch(url, {
        ...options,
        signal: AbortSignal.timeout(recurringRpcTimeout()),
      }),
  });
}

export async function verifyDevnetConnection(
  connection: Connection,
): Promise<void> {
  let genesis: string;
  try {
    genesis = await connection.getGenesisHash();
  } catch {
    throw new Error("The recurring devnet RPC is unavailable.");
  }
  if (genesis !== DEVNET_GENESIS_HASH) {
    throw new Error(
      "Recurring investing is restricted to Solana devnet. The configured RPC belongs to another cluster.",
    );
  }
}

export function withinRecurringDeadline<T>(
  deadlineAt: number,
  operation: () => Promise<T>,
): Promise<T> {
  return deadline.run(
    Math.min(deadlineAt, deadline.getStore() ?? deadlineAt),
    operation,
  );
}

/** All RPC work in a collector pass shares one deadline; requests cannot outlive the pass. */
export function recurringRpcTimeout(): number {
  const remaining = (deadline.getStore() ?? Date.now() + 12_000) - Date.now();
  if (remaining <= 0)
    throw new Error("The recurring collection pass reached its time limit.");
  return Math.min(12_000, remaining);
}
