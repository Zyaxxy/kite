import { gzipSync, gunzipSync } from "node:zlib";
import type { MarketSnapshot, BasketPerformance } from "@kite/sdk";

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

function compressValue(str: string): string {
  if (str.length < 2048) return str;
  try {
    return "gz:" + gzipSync(Buffer.from(str, "utf8")).toString("base64");
  } catch {
    return str;
  }
}

function decompressValue(str: string): string {
  if (typeof str === "string" && str.startsWith("gz:")) {
    try {
      return gunzipSync(Buffer.from(str.slice(3), "base64")).toString("utf8");
    } catch {
      return str;
    }
  }
  return str;
}

export function isValidCatalog(
  snapshot: MarketSnapshot | null | undefined,
): snapshot is MarketSnapshot {
  if (!snapshot) return false;
  if (snapshot.network !== "mainnet-beta") return false;
  if (snapshot.status === "unavailable") return false;
  if (!Array.isArray(snapshot.assets) || snapshot.assets.length === 0) return false;

  // Primary equity universe: xStocks must be present
  const hasXstocks = snapshot.assets.some((asset) => asset.issuer === "xstocks");
  if (!hasXstocks) return false;

  // Must not have an active xStocks load failure
  if (
    Array.isArray(snapshot.warnings) &&
    snapshot.warnings.some((warning) => /xstocks.*could not be loaded/i.test(warning))
  ) {
    return false;
  }

  return true;
}

async function executeRedisCommand<T = unknown>(
  command: unknown[],
  timeoutMs = 5000,
): Promise<T | null> {
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
      signal: AbortSignal.timeout(timeoutMs),
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
    const raw = await executeRedisCommand<string>(["GET", "kite:markets:snapshot"], 5000);
    if (!raw) return null;
    const decompressed = decompressValue(raw);
    const parsed = JSON.parse(decompressed);
    if (isValidCatalog(parsed)) {
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
  if (!isRedisConfigured() || !isValidCatalog(snapshot)) return;
  try {
    const value = compressValue(JSON.stringify(snapshot));
    await executeRedisCommand(
      ["SET", "kite:markets:snapshot", value, "EX", ttlSeconds],
      6000,
    );
  } catch {
    // Non-blocking fallback
  }
}

export async function getRedisCatalog(): Promise<MarketSnapshot | null> {
  if (!isRedisConfigured()) return null;
  try {
    const raw = await executeRedisCommand<string>(["GET", "kite:markets:catalog"], 5000);
    if (!raw) return null;
    const decompressed = decompressValue(raw);
    const parsed = JSON.parse(decompressed);
    if (isValidCatalog(parsed)) {
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
  if (!isRedisConfigured() || !isValidCatalog(catalog)) return;
  try {
    const value = compressValue(JSON.stringify(catalog));
    await executeRedisCommand(
      ["SET", "kite:markets:catalog", value, "EX", ttlSeconds],
      6000,
    );
  } catch {
    // Non-blocking fallback
  }
}

export async function getRedisBasketPerformance(
  key: string,
): Promise<BasketPerformance | null> {
  if (!isRedisConfigured()) return null;
  try {
    const raw = await executeRedisCommand<string>(["GET", `kite:perf:${key}`], 3000);
    if (!raw) return null;
    const decompressed = decompressValue(raw);
    const parsed = JSON.parse(decompressed);
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
    const value = compressValue(JSON.stringify(performance));
    await executeRedisCommand(
      ["SET", `kite:perf:${key}`, value, "EX", ttlSeconds],
      4000,
    );
  } catch {
    // Non-blocking fallback
  }
}
