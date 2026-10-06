import { classifyJupiterRouteError, ROUTE_ACCOUNT_TIERS } from "@kite/sdk";

interface KeyState {
  key: string;
  nextRequestAt: number;
  cooldownUntil: number;
}

let keyPool: KeyState[] | null = null;

function getKeyPool(fallbackKey: string): KeyState[] {
  if (keyPool) return keyPool;

  const raw =
    process.env.JUPITER_API_KEYS ||
    process.env.JUPITER_API_KEY ||
    fallbackKey ||
    "";
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!keys.length && fallbackKey) {
    keys.push(fallbackKey);
  }

  const uniqueKeys = Array.from(new Set(keys)).filter(Boolean);

  keyPool = uniqueKeys.map((key) => ({
    key,
    nextRequestAt: 0,
    cooldownUntil: 0,
  }));

  return keyPool;
}

async function acquireKey(
  pool: KeyState[],
  waitBudgetMs = 15_000,
): Promise<KeyState> {
  if (!pool.length) throw new Error("Jupiter routing is not configured.");

  const now = Date.now();
  const available = pool.filter((k) => k.cooldownUntil <= now);
  const activePool = available.length > 0 ? available : pool;

  activePool.sort(
    (a, b) =>
      Math.max(a.nextRequestAt, a.cooldownUntil) -
      Math.max(b.nextRequestAt, b.cooldownUntil),
  );
  const selected = activePool[0];

  const slot = Math.max(now, selected.nextRequestAt, selected.cooldownUntil);
  if (slot - now > waitBudgetMs) {
    throw new Error("Basket routing is busy. Please try again shortly.");
  }

  selected.nextRequestAt = slot + 1250;
  if (slot > now) {
    await new Promise((resolve) => setTimeout(resolve, slot - now));
  }

  return selected;
}

export async function fetchJupiterBuild(
  params: URLSearchParams,
  fallbackKey: string,
): Promise<Response> {
  return fetchWithRouteRetry(params, (request) =>
    fetchJupiter(request, fallbackKey, "swap/v2/build"),
  );
}

/** Quote-only Metis observations share the build API's key pool and throttle. */
export async function fetchJupiterQuote(
  params: URLSearchParams,
  fallbackKey: string,
): Promise<Response> {
  const deadline = Date.now() + 20_000;
  return fetchWithRouteRetry(params, (request) =>
    fetchJupiter(request, fallbackKey, "swap/v1/quote", deadline),
  );
}

export async function fetchWithRouteRetry(
  params: URLSearchParams,
  fetcher: (params: URLSearchParams) => Promise<Response>,
): Promise<Response> {
  // Never widen routing on auth, rate limits, malformed instructions or simulations.
  let response: Response | undefined;
  for (const tier of ROUTE_ACCOUNT_TIERS) {
    const request = new URLSearchParams(params);
    request.set("maxAccounts", String(tier));
    response = await fetcher(request);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set("x-kite-route-max-accounts", String(tier));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    const error = await response
      .clone()
      .json()
      .catch(() => null);
    if (classifyJupiterRouteError(response.status, error) !== "no-route")
      return response;
  }
  return response!;
}

async function fetchJupiter(
  params: URLSearchParams,
  fallbackKey: string,
  endpoint: string,
  deadline?: number,
): Promise<Response> {
  const pool = getKeyPool(fallbackKey);
  const advisory = endpoint === "swap/v1/quote";
  const attempts = advisory ? 1 : Math.min(pool.length * 2, 4);

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (deadline !== undefined && deadline <= Date.now())
      throw new Error("Advisory route check timed out.");
    const keyState = await acquireKey(
      pool,
      deadline === undefined ? 15_000 : Math.min(15_000, deadline - Date.now()),
    );
    if (deadline !== undefined && deadline <= Date.now())
      throw new Error("Advisory route check timed out.");

    const response = await fetch(`https://api.jup.ag/${endpoint}?${params}`, {
      headers: { "x-api-key": keyState.key },
      cache: "no-store",
      signal: AbortSignal.timeout(
        deadline === undefined
          ? 15_000
          : Math.max(1, Math.min(5000, deadline - Date.now())),
      ),
    });

    if (response.status !== 429) return response;

    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const retry = Number(response.headers.get("retry-after") ?? 5);
    const cooldownMs = reset
      ? Math.max(2000, reset * 1000 - Date.now() + 250)
      : retry * 1000;

    keyState.cooldownUntil = Date.now() + cooldownMs;
    if (advisory) return response;
  }

  throw new Error(
    "Jupiter is limiting quote requests. Wait a moment before reviewing this basket again.",
  );
}
