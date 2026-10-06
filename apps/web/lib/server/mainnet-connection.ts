import { Connection } from "@solana/web3.js";

export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
let cached: { endpoint: string; connection: Connection } | undefined;

/** Mainnet credentials are never inherited from recurring/devnet or browser configuration. */
export function getMainnetRpcUrl(): string {
  const endpoint =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    /(^|[.\/-])(devnet|testnet)([.\/-]|$)/i.test(url.hostname + url.pathname)
  )
    throw new Error("Configure a dedicated HTTPS Solana mainnet RPC.");
  return url.toString();
}

/** Check genesis on every new operation before returning a usable RPC connection. */
export async function getMainnetConnection(): Promise<Connection> {
  const endpoint = getMainnetRpcUrl();
  if (!cached || cached.endpoint !== endpoint)
    cached = {
      endpoint,
      connection: new Connection(endpoint, {
        commitment: "confirmed",
        disableRetryOnRateLimit: true,
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(12_000) }),
      }),
    };
  let genesis: string;
  try {
    genesis = await cached.connection.getGenesisHash();
  } catch {
    throw new Error("The mainnet RPC is unavailable.");
  }
  if (genesis !== MAINNET_GENESIS)
    throw new Error("The server RPC must use Solana mainnet.");
  return cached.connection;
}
