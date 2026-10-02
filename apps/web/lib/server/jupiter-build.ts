export type JupiterBuildFailureKind =
  | "no-route"
  | "rate-limited"
  | "authentication"
  | "unavailable"
  | "invalid-response"
  | "request-rejected";

export class JupiterBuildError extends Error {
  constructor(
    readonly kind: JupiterBuildFailureKind,
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "JupiterBuildError";
  }

  get noRoute(): boolean {
    return this.kind === "no-route";
  }
}

const rateLimited = () =>
  new JupiterBuildError(
    "rate-limited",
    "Jupiter is limiting quote requests. Wait a moment before reviewing this basket again.",
    429,
  );
const unavailable = (status?: number) =>
  new JupiterBuildError(
    "unavailable",
    "Jupiter routing is temporarily unavailable. No transactions were submitted. Try reviewing this basket again shortly.",
    status,
  );

/** Keep provider bodies/URLs out of errors returned to the browser. */
export async function describeJupiterBuildFailure(
  response: Response,
  symbol: string,
): Promise<JupiterBuildError> {
  if (response.status === 429) return rateLimited();
  if (response.status === 401 || response.status === 403)
    return new JupiterBuildError(
      "authentication",
      "Jupiter routing authentication failed. The server's Jupiter API configuration needs attention.",
      response.status,
    );
  if (response.status >= 500 || response.status === 408)
    return unavailable(response.status);

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return new JupiterBuildError(
      "invalid-response",
      "Jupiter returned an unreadable routing response. No transactions were submitted. Try reviewing this basket again shortly.",
      response.status,
    );
  }
  // Observed Swap V2 build response. Do not infer no liquidity from arbitrary
  // provider errors or from HTTP 400 alone.
  if (
    response.status === 400 &&
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body as { error?: unknown }).error === "No routes found"
  )
    return new JupiterBuildError(
      "no-route",
      `Jupiter found no executable route for ${symbol} with this funding token and amount. Try a different funding token or amount, or a basket without this asset.`,
      response.status,
    );
  return new JupiterBuildError(
    "request-rejected",
    `Jupiter could not prepare the route for ${symbol} (HTTP ${response.status}). No transactions were submitted. This does not establish that liquidity is unavailable.`,
    response.status,
  );
}

interface KeyState {
  key: string;
  nextRequestAt: number;
  cooldownUntil: number;
}

let keyPool: KeyState[] | null = null;
const REQUEST_BUDGET_MS = 15_000;

function getKeyPool(fallbackKey: string): KeyState[] {
  if (keyPool) return keyPool;
  const raw =
    process.env.JUPITER_API_KEYS ||
    process.env.JUPITER_API_KEY ||
    fallbackKey ||
    "";
  const keys = raw
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (!keys.length && fallbackKey) keys.push(fallbackKey);
  keyPool = Array.from(new Set(keys)).map((key) => ({
    key,
    nextRequestAt: 0,
    cooldownUntil: 0,
  }));
  return keyPool;
}

async function acquireKey(
  pool: KeyState[],
  deadline: number,
): Promise<KeyState> {
  if (!pool.length) throw new Error("Jupiter routing is not configured.");
  while (true) {
    const now = Date.now();
    const eligibleAt = (key: KeyState) =>
      Math.max(now, key.nextRequestAt, key.cooldownUntil);
    const selected = pool.reduce((earliest, key) =>
      eligibleAt(key) < eligibleAt(earliest) ? key : earliest,
    );
    const slot = eligibleAt(selected);
    if (slot >= deadline) throw rateLimited();
    selected.nextRequestAt = slot + 1250;
    if (slot > now)
      await new Promise((resolve) => setTimeout(resolve, slot - now));
    // Another in-flight request may have put this key on cooldown while queued.
    if (selected.cooldownUntil > Date.now()) continue;
    if (Date.now() >= deadline) throw rateLimited();
    return selected;
  }
}

function cooldownUntil(headers: Headers, now: number): number {
  const deadlines: number[] = [];
  const reset = headers.get("x-ratelimit-reset")?.trim();
  if (reset && /^\d+(?:\.\d+)?$/.test(reset)) {
    const timestamp = Number(reset) * 1000 + 250;
    if (Number.isSafeInteger(Math.ceil(timestamp)) && timestamp > now)
      deadlines.push(timestamp);
  }
  const retry = headers.get("retry-after")?.trim();
  if (retry) {
    const timestamp = /^\d+(?:\.\d+)?$/.test(retry)
      ? now + Number(retry) * 1000
      : /^[A-Za-z]{3},/.test(retry)
        ? Date.parse(retry)
        : NaN;
    if (Number.isSafeInteger(Math.ceil(timestamp)) && timestamp >= now)
      deadlines.push(timestamp);
  }
  // A long provider cooldown is retained; the request budget rejects the wait
  // instead of truncating it and retrying before the provider permits it.
  return deadlines.length ? Math.max(now + 1000, ...deadlines) : now + 5000;
}

export async function fetchJupiterBuild(
  params: URLSearchParams,
  fallbackKey: string,
): Promise<Response> {
  const pool = getKeyPool(fallbackKey);
  const attempts = Math.min(pool.length * 2, 4);
  const deadline = Date.now() + REQUEST_BUDGET_MS;
  if (!pool.length) throw new Error("Jupiter routing is not configured.");

  for (let attempt = 0; attempt < attempts; attempt++) {
    const keyState = await acquireKey(pool, deadline);
    let response: Response;
    try {
      response = await fetch(`https://api.jup.ag/swap/v2/build?${params}`, {
        headers: { "x-api-key": keyState.key },
        cache: "no-store",
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      });
    } catch {
      throw unavailable();
    }
    if (response.status !== 429) return response;
    keyState.cooldownUntil = Math.max(
      keyState.cooldownUntil,
      cooldownUntil(response.headers, Date.now()),
    );
  }
  throw rateLimited();
}
