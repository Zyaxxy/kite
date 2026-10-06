import type { RouteObservation } from "@kite/sdk";

interface Entry {
  observation: RouteObservation;
  successes: number[];
  retainUntil: number;
}
export interface RouteHealthCacheStorage {
  read(key: string): Promise<Entry | null>;
  write(key: string, entry: Entry): Promise<void>;
  claim(key: string): Promise<string | null>;
  release(key: string, token: string): Promise<void>;
  budget(): Promise<boolean>;
}
export const ROUTE_HEALTH_TTL = {
  routable: 300_000,
  "no-route": 120_000,
  liquidity: 60_000,
  capacity: 300_000,
  unknown: 20_000,
  unavailable: 120_000,
} as const;
const RETAIN = 30 * 60_000;

/** Bounded memory + shared leases. Stale observations retain their original dates. */
export function createRouteHealthCache(
  storage: RouteHealthCacheStorage,
  now = Date.now,
) {
  const memory = new Map<string, Entry>();
  const pending = new Map<string, Promise<RouteObservation>>();
  function remember(key: string, entry: Entry) {
    if (memory.size >= 2048 && !memory.has(key))
      memory.delete(memory.keys().next().value!);
    memory.set(key, entry);
  }
  async function read(key: string): Promise<Entry | null> {
    let entry = memory.get(key) ?? null;
    if (!entry || entry.observation.expiresAt <= now()) {
      const shared = await storage.read(key);
      if (
        shared &&
        shared.retainUntil > now() &&
        (!entry || shared.observation.checkedAt > entry.observation.checkedAt)
      ) {
        entry = shared;
        remember(key, shared);
      }
    }
    return entry && entry.retainUntil > now() ? entry : null;
  }
  async function peek(key: string) {
    return (await read(key))?.observation ?? null;
  }
  function get(
    key: string,
    probeAmount: string,
    load: () => Promise<
      Omit<RouteObservation, "checkedAt" | "expiresAt" | "consistent">
    >,
  ): Promise<RouteObservation> {
    const existing = pending.get(key);
    if (existing) return existing;
    const task = (async () => {
      const entry = await read(key);
      if (entry && entry.observation.expiresAt > now())
        return entry.observation;
      const unknown = (): RouteObservation =>
        entry?.observation ?? {
          status: "unknown",
          probeAmount,
          checkedAt: now(),
          expiresAt: now() + ROUTE_HEALTH_TTL.unknown,
          maxAccounts: null,
          consistent: false,
          detail:
            "Route checks are busy or unavailable. Exact review can check again.",
        };
      const token = await storage.claim(key);
      if (!token) return unknown();
      try {
        if (!(await storage.budget())) return unknown();
        let result: Awaited<ReturnType<typeof load>>;
        try {
          result = await load();
        } catch {
          result = {
            status: "unknown",
            probeAmount,
            maxAccounts: null,
            detail:
              "Routing or the mainnet RPC could not be verified. Liquidity was not determined.",
          };
        }
        const checkedAt = now();
        const successes =
          result.status === "routable"
            ? (entry?.successes ?? []).filter(
                (time) => time > checkedAt - 86_400_000,
              )
            : [];
        if (
          result.status === "routable" &&
          (!successes.length ||
            checkedAt - successes[successes.length - 1] >= 300_000)
        )
          successes.push(checkedAt);
        const observation: RouteObservation = {
          ...result,
          checkedAt,
          expiresAt: checkedAt + ROUTE_HEALTH_TTL[result.status],
          consistent: successes.length >= 3,
        };
        const next = {
          observation,
          successes: successes.slice(-12),
          retainUntil: checkedAt + RETAIN,
        };
        remember(key, next);
        await storage.write(key, next);
        return observation;
      } finally {
        await storage.release(key, token);
      }
    })().finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  return { get, peek };
}
