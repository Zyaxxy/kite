import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export class KeeperError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function requireCollectorAuthorization(
  authorization: string | null,
  env: Record<string, string | undefined> = process.env,
): void {
  const secret =
    env.KITE_RECURRING_EXECUTOR_SECRET?.trim() || env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32)
    throw new KeeperError(
      "The recurring executor bearer secret is not configured.",
      503,
    );
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (
    !token ||
    token.length > 512 ||
    !timingSafeEqual(
      createHash("sha256").update(secret).digest(),
      createHash("sha256").update(token).digest(),
    )
  ) {
    throw new KeeperError("A valid executor bearer token is required.", 401);
  }
}

type LocalEntry = { value: string; expiresAt: number };
const local = new Map<string, LocalEntry>();

/** Durable Redis for production; in-memory state is only for a single development process. */
async function command<T>(values: Array<string | number>): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
        signal: AbortSignal.timeout(2_000),
        cache: "no-store",
      });
      const payload: { result?: T | null; error?: unknown } =
        await response.json();
      if (!response.ok || payload.error || !("result" in payload))
        throw new Error();
      return payload.result ?? null;
    } catch {
      throw new KeeperError(
        "Recurring collector persistence is unavailable; no new debit was started.",
        503,
      );
    }
  }
  if (process.env.NODE_ENV === "production")
    throw new KeeperError(
      "Configure Redis for production recurring collection leases and retry state.",
      503,
    );
  for (const [key, entry] of local)
    if (entry.expiresAt <= Date.now()) local.delete(key);
  const [operation, key, value] = values;
  if (operation === "GET")
    return (local.get(String(key))?.value ?? null) as T | null;
  if (operation === "SET") {
    if (values.includes("NX") && local.has(String(key))) return null;
    const px = values.indexOf("PX");
    local.set(String(key), {
      value: String(value),
      expiresAt: Date.now() + Number(values[px + 1]),
    });
    return "OK" as T;
  }
  if (operation === "DEL") {
    local.delete(String(key));
    return 1 as T;
  }
  if (operation === "EVAL") {
    const lockKey = String(values[3]);
    if (local.get(lockKey)?.value !== values[4]) return 0 as T;
    local.delete(lockKey);
    return 1 as T;
  }
  throw new Error("Unsupported collector state operation.");
}

const PREFIX = "kite:recurring:devnet:v2:";
export const keeperStore = {
  async read<T>(key: string): Promise<T | null> {
    const value = await command<string>(["GET", PREFIX + key]);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new KeeperError(
        "Invalid persisted recurring state; collection is blocked.",
        503,
      );
    }
  },
  async write(key: string, value: unknown, ttlMs = 86_400_000): Promise<void> {
    if (
      (await command([
        "SET",
        PREFIX + key,
        JSON.stringify(value),
        "PX",
        ttlMs,
      ])) !== "OK"
    )
      throw new KeeperError("Unable to persist recurring retry state.", 503);
  },
  async remove(key: string): Promise<void> {
    await command(["DEL", PREFIX + key]);
  },
};

export async function withCollectorLease<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const key = PREFIX + "pass-lock",
    token = randomUUID();
  // Longer than both the 40s work budget and the route's 60s maximum execution time.
  if ((await command(["SET", key, token, "NX", "PX", 120_000])) !== "OK")
    throw new KeeperError(
      "A recurring collection pass is already running.",
      409,
    );
  try {
    return await operation();
  } finally {
    // A worker must never release another worker's lease after an interruption.
    await command([
      "EVAL",
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      token,
    ]).catch(() => undefined);
  }
}

export type KeeperOutcome =
  "confirmed" | "submitted" | "unknown" | "failed" | "expired";
export interface CollectorSummary {
  scanned: number;
  due: number;
  collected: number;
  pending: number;
  skipped: number;
  failed: number;
  deferred: number;
  results: Array<{
    plan: string;
    periodIndex: number;
    signature?: string;
    status?: KeeperOutcome;
    error?: string;
  }>;
}

/** Independent plan failures do not stop later wallets. Work is bounded by count and wall time. */
export async function runIsolatedCollector<T>(input: {
  entries: readonly T[];
  address: (entry: T) => string;
  duePeriod: (entry: T) => number | null;
  collect: (
    entry: T,
    period: number,
  ) => Promise<{ signature: string; status: KeeperOutcome }>;
  deadline: number;
  now?: () => number;
  maxPlans?: number;
}): Promise<CollectorSummary> {
  const now = input.now ?? Date.now;
  const summary: CollectorSummary = {
    scanned: 0,
    due: 0,
    collected: 0,
    pending: 0,
    skipped: 0,
    failed: 0,
    deferred: 0,
    results: [],
  };
  for (const entry of input.entries) {
    if (now() >= input.deadline || summary.scanned >= (input.maxPlans ?? 32))
      break;
    summary.scanned++;
    let period = -1;
    try {
      const due = input.duePeriod(entry);
      if (due === null) {
        summary.skipped++;
        continue;
      }
      period = due;
      summary.due++;
      const result = await input.collect(entry, period);
      summary.results.push({
        plan: input.address(entry),
        periodIndex: period,
        ...result,
      });
      if (result.status === "confirmed") summary.collected++;
      else if (result.status === "submitted" || result.status === "unknown")
        summary.pending++;
      else summary.failed++;
    } catch (error) {
      summary.failed++;
      summary.results.push({
        plan: input.address(entry),
        periodIndex: period,
        error:
          error instanceof Error
            ? error.message
            : "Unable to collect this plan.",
      });
    }
  }
  summary.deferred = input.entries.length - summary.scanned;
  return summary;
}
