import { PublicKey } from "@solana/web3.js";
import { parseJupiterSwapTokens, type SwapToken } from "@kite/sdk";

const cache = new Map<string, { tokens: SwapToken[]; expiresAt: number }>();
const pending = new Map<string, Promise<SwapToken[]>>();

/** Jupiter indexes arbitrary Solana tokens; an index entry is not an issuer endorsement. */
export async function searchJupiterSwapTokens(
  query: string,
): Promise<SwapToken[]> {
  const cached = cache.get(query);
  if (cached && cached.expiresAt > Date.now()) return cached.tokens;
  const active = pending.get(query);
  if (active) return active;
  const task = (async () => {
    const apiKey = process.env.JUPITER_API_KEY?.split(",")[0]?.trim();
    const response = await fetch(
      `https://api.jup.ag/tokens/v2/search?${new URLSearchParams({ query })}`,
      {
        headers: apiKey ? { "x-api-key": apiKey } : {},
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok)
      throw new Error("Token discovery is temporarily unavailable.");
    const payload: unknown = await response.json();
    if (!Array.isArray(payload))
      throw new Error("Token discovery is temporarily unavailable.");
    const tokens = parseJupiterSwapTokens(payload).filter((token) => {
      try {
        return new PublicKey(token.mint).toBase58() === token.mint;
      } catch {
        return false;
      }
    });
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(query, { tokens, expiresAt: Date.now() + 60_000 });
    return tokens;
  })().finally(() => {
    pending.delete(query);
  });
  pending.set(query, task);
  return task;
}
