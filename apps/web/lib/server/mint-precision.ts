import { createMainnetMintPrecisionResolver } from "@kite/sdk";
import { getMainnetConnection, getMainnetRpcUrl } from "./mainnet-connection";

let active: {
  endpoint: string;
  resolve: ReturnType<typeof createMainnetMintPrecisionResolver>;
} | null = null;

/** Resolve trade quantities from the mint account, independently of quote metadata. */
export async function getTradeMintDecimals(mint: string): Promise<number> {
  const endpoint = getMainnetRpcUrl();
  if (!active || active.endpoint !== endpoint) {
    const connection = await getMainnetConnection();
    active = {
      endpoint,
      resolve: createMainnetMintPrecisionResolver(connection),
    };
  }
  return active.resolve(mint);
}
