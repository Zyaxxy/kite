import type { MarketSnapshot, BasketPerformance } from "@kite/sdk";

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

async function executeRedisCommand<T = unknown>(command: unknown[]): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { result?: unknown };
    return (data?.result as T) ?? null;
  } catch {
    return null;
  }
}

export async function getRedisMarketSnapshot(): Promise<MarketSnapshot | null> {
  if (!isRedisConfigured()) return null;
  try {
    const raw = await executeRedisCommand<string>(["GET", "kite:markets:snapshot"]);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.network === "mainnet-beta" &&
      Array.isArray(parsed.assets) &&
      parsed.status !== "unavailable"
    ) {
      return parsed as MarketSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setRedisMarketSnapshot(
  snapshot: MarketSnapshot,
  ttlSeconds = 86400,
): Promise<void> {
  if (!isRedisConfigured() || snapshot.status === "unavailable") return;
  try {
    await executeRedisCommand([
      "SET",
      "kite:markets:snapshot",
      JSON.stringify(snapshot),
      "EX",
      ttlSeconds,
    ]);
  } catch {
    // Non-blocking fallback
  }
}

export async function getRedisCatalog(): Promise<MarketSnapshot | null> {
  if (!isRedisConfigured()) return null;
  try {
    const raw = await executeRedisCommand<string>(["GET", "kite:markets:catalog"]);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.network === "mainnet-beta" &&
      Array.isArray(parsed.assets) &&
      parsed.assets.length > 0
    ) {
      return parsed as MarketSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setRedisCatalog(
  catalog: MarketSnapshot,
  ttlSeconds = 86400,
): Promise<void> {
  if (!isRedisConfigured() || !catalog.assets.length) return;
  try {
    await executeRedisCommand([
      "SET",
      "kite:markets:catalog",
      JSON.stringify(catalog),
      "EX",
      ttlSeconds,
    ]);
  } catch {
    // Non-blocking fallback
  }
}

export async function getRedisBasketPerformance(
  key: string,
): Promise<BasketPerformance | null> {
  if (!isRedisConfigured()) return null;
  try {
    const raw = await executeRedisCommand<string>(["GET", `kite:perf:${key}`]);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.basketId && parsed.status !== "unavailable") {
      return parsed as BasketPerformance;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setRedisBasketPerformance(
  key: string,
  performance: BasketPerformance,
  ttlSeconds = 3600,
): Promise<void> {
  if (!isRedisConfigured() || performance.status === "unavailable") return;
  try {
    await executeRedisCommand([
      "SET",
      `kite:perf:${key}`,
      JSON.stringify(performance),
      "EX",
      ttlSeconds,
    ]);
  } catch {
    // Non-blocking fallback
  }
}


