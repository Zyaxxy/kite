import { getMainnetMarkets, type MarketSnapshot } from '@kite/sdk';

let cached: { value: MarketSnapshot; expiresAt: number } | null = null;
let pending: Promise<MarketSnapshot> | null = null;

/** Shared short-lived server cache for web, mobile, and the trade-mint allowlist. */
export async function getServerMarkets(): Promise<MarketSnapshot> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (pending) return pending;
  pending = getMainnetMarkets({ jupiterApiKey: process.env.JUPITER_API_KEY })
    .then(value => {
      cached = { value, expiresAt: Date.now() + (value.status === 'unavailable' ? 10_000 : 30_000) };
      return value;
    })
    .finally(() => { pending = null; });
  return pending;
}
