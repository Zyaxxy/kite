import type { StockResearch } from "./research";

type CachedResearch = {
  value: StockResearch;
  expiresAt: number;
  retainedUntil: number;
};
type PendingResearch = {
  controller: AbortController;
  promise: Promise<StockResearch>;
  readers: number;
  abortTimer?: ReturnType<typeof setTimeout>;
};

function aborted(): Error {
  const error = new Error("Research request cancelled.");
  error.name = "AbortError";
  return error;
}

export interface ResearchClientOptions {
  maxEntries?: number;
  freshMs?: number;
  partialMs?: number;
  unavailableMs?: number;
  retainMs?: number;
  timeoutMs?: number;
  abortGraceMs?: number;
  /** Injectable clock for deterministic cache tests. */
  now?: () => number;
}

export interface ResearchClient {
  peek(mint: string): StockResearch | null;
  load(
    mint: string,
    signal: AbortSignal,
    force?: boolean,
  ): Promise<StockResearch>;
}

/** Shared client transport cache; the loader keeps platform fetch details outside the SDK. */
export function createResearchClient(
  loader: (mint: string, signal: AbortSignal) => Promise<StockResearch>,
  options: ResearchClientOptions = {},
): ResearchClient {
  const { now: clock = Date.now, ...overrides } = options;
  const settings = {
    maxEntries: 30,
    freshMs: 5 * 60_000,
    partialMs: 60_000,
    unavailableMs: 15_000,
    retainMs: 30 * 60_000,
    timeoutMs: 60_000,
    abortGraceMs: 100,
    ...overrides,
  };
  if (!Number.isSafeInteger(settings.maxEntries) || settings.maxEntries < 1)
    throw new RangeError("Research cache size must be a positive integer.");
  for (const duration of [
    settings.freshMs,
    settings.partialMs,
    settings.unavailableMs,
    settings.retainMs,
    settings.timeoutMs,
    settings.abortGraceMs,
  ]) {
    if (!Number.isFinite(duration) || duration < 0)
      throw new RangeError(
        "Research cache durations must be finite and nonnegative.",
      );
  }
  const cache = new Map<string, CachedResearch>();
  const pending = new Map<string, PendingResearch>();

  /** Reuse only previously returned research; observation dates are never rewritten. */
  function peek(mint: string): StockResearch | null {
    const entry = cache.get(mint);
    if (!entry) return null;
    if (entry.retainedUntil <= clock()) {
      cache.delete(mint);
      return null;
    }
    cache.delete(mint);
    cache.set(mint, entry);
    return entry.value;
  }

  function load(
    mint: string,
    signal: AbortSignal,
    force = false,
  ): Promise<StockResearch> {
    if (signal.aborted) return Promise.reject(aborted());
    const cached = cache.get(mint);
    if (!force && cached && cached.expiresAt > clock())
      return Promise.resolve(cached.value);

    let operation = pending.get(mint);
    if (operation?.controller.signal.aborted) operation = undefined;
    if (!operation) {
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, settings.timeoutMs);
      const request: PendingResearch = {
        controller,
        readers: 0,
        promise: Promise.resolve()
          .then(() => loader(mint, controller.signal))
          .then((value) => {
            if (controller.signal.aborted) throw aborted();
            if (
              !value ||
              value.mint !== mint ||
              !["available", "partial", "unavailable"].includes(value.status) ||
              !Array.isArray(value.bars) ||
              !Array.isArray(value.fundamentals) ||
              !Array.isArray(value.news) ||
              !Array.isArray(value.events) ||
              !Array.isArray(value.sources) ||
              !Array.isArray(value.warnings) ||
              (value.refreshing !== undefined &&
                typeof value.refreshing !== "boolean") ||
              !Number.isFinite(Date.parse(value.asOf))
            ) {
              throw new Error("Company research returned an invalid response.");
            }
            const ttl =
              value.status === "available"
                ? settings.freshMs
                : value.status === "partial"
                  ? settings.partialMs
                  : settings.unavailableMs;
            const receivedAt = clock();
            // A server cache hit must not restart the age of the observed research.
            const observedAt = Math.min(receivedAt, Date.parse(value.asOf));
            cache.delete(mint);
            cache.set(mint, {
              value,
              expiresAt: value.refreshing ? receivedAt : observedAt + ttl,
              retainedUntil: receivedAt + settings.retainMs,
            });
            while (cache.size > settings.maxEntries)
              cache.delete(cache.keys().next().value!);
            return value;
          })
          .catch((error: unknown) => {
            if (timedOut)
              throw new Error(
                "Company research took too long to respond. Please retry.",
              );
            throw error;
          })
          .finally(() => {
            clearTimeout(timeout);
            clearTimeout(request.abortTimer);
            if (pending.get(mint) === request) pending.delete(mint);
          }),
      };
      pending.set(mint, request);
      operation = request;
    }

    const request = operation;
    clearTimeout(request.abortTimer);
    request.readers += 1;
    return new Promise<StockResearch>((resolve, reject) => {
      let settled = false;
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        request.readers -= 1;
        if (request.readers === 0 && pending.get(mint) === request) {
          // A brief grace period lets Strict Mode remounts reuse the same request.
          request.abortTimer = setTimeout(() => {
            if (request.readers === 0) request.controller.abort();
          }, settings.abortGraceMs);
        }
        settle();
      };
      const onAbort = () => finish(() => reject(aborted()));
      signal.addEventListener("abort", onAbort, { once: true });
      request.promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
      if (signal.aborted) onAbort();
    });
  }

  return { peek, load };
}
