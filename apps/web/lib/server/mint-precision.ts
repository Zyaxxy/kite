import { Connection } from "@solana/web3.js";
import { createMainnetMintPrecisionResolver } from "@kite/sdk";

let active: {
  endpoint: string;
  resolve: ReturnType<typeof createMainnetMintPrecisionResolver>;
} | null = null;

/** Resolve trade quantities from the mint account, independently of quote metadata. */
export async function getTradeMintDecimals(mint: string): Promise<number> {
  const endpoint =
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com";
  if (!active || active.endpoint !== endpoint) {
    const connection = new Connection(endpoint, {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(12_000) }),
    });
    active = {
      endpoint,
      resolve: createMainnetMintPrecisionResolver(connection),
    };
  }
  return active.resolve(mint);
}
