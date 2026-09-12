import { PublicKey, type Connection } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
} from "@solana/spl-token";

const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const MAX_CACHED_MINTS = 2_048;

/** Resolve raw token precision from initialized mainnet mint accounts, independently of price metadata. */
export function createMainnetMintPrecisionResolver(
  connection: Pick<Connection, "getGenesisHash" | "getAccountInfo">,
  options: { cacheTtlMs?: number; now?: () => number } = {},
): (mint: string | PublicKey) => Promise<number> {
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0)
    throw new Error("Invalid mint precision cache duration.");
  const now = options.now ?? Date.now;
  const cache = new Map<string, { decimals: number; expiresAt: number }>();
  const pendingMints = new Map<string, Promise<number>>();
  let mainnetVerifiedUntil = -Infinity;
  let pendingGenesis: Promise<void> | null = null;

  async function verifyMainnet(): Promise<void> {
    if (mainnetVerifiedUntil > now()) return;
    if (pendingGenesis) return pendingGenesis;
    const operation = (async () => {
      if ((await connection.getGenesisHash()) !== MAINNET_GENESIS_HASH) {
        throw new Error("The configured RPC is not Solana mainnet.");
      }
      mainnetVerifiedUntil = now() + cacheTtlMs;
    })();
    pendingGenesis = operation;
    try {
      await operation;
    } finally {
      pendingGenesis = null;
    }
  }

  return async (mint: string | PublicKey): Promise<number> => {
    const address = typeof mint === "string" ? new PublicKey(mint) : mint;
    const key = address.toBase58();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.decimals;
    if (cached) cache.delete(key);
    const pending = pendingMints.get(key);
    if (pending) return pending;

    const operation = (async () => {
      await verifyMainnet();
      const account = await connection.getAccountInfo(address, "confirmed");
      if (!account)
        throw new Error("The token mint account is unavailable on mainnet.");
      if (
        account.executable ||
        (!account.owner.equals(TOKEN_PROGRAM_ID) &&
          !account.owner.equals(TOKEN_2022_PROGRAM_ID))
      ) {
        throw new Error("The account is not a supported token mint.");
      }
      const decoded = unpackMint(address, account, account.owner);
      if (!decoded.isInitialized)
        throw new Error("The token mint has not been initialized.");
      if (
        !Number.isInteger(decoded.decimals) ||
        decoded.decimals < 0 ||
        decoded.decimals > 18
      ) {
        throw new Error("Unsupported token precision.");
      }
      if (cacheTtlMs > 0) {
        if (cache.size >= MAX_CACHED_MINTS) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(key, {
          decimals: decoded.decimals,
          expiresAt: now() + cacheTtlMs,
        });
      }
      return decoded.decimals;
    })();
    pendingMints.set(key, operation);
    try {
      return await operation;
    } finally {
      pendingMints.delete(key);
    }
  };
}
