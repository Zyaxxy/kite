interface KeyState {
  key: string;
  nextRequestAt: number;
  cooldownUntil: number;
}

let keyPool: KeyState[] | null = null;

function getKeyPool(fallbackKey: string): KeyState[] {
  if (keyPool) return keyPool;
  
  const raw = process.env.JUPITER_API_KEYS || process.env.JUPITER_API_KEY || fallbackKey || "";
  const keys = raw.split(",").map((k) => k.trim()).filter(Boolean);
  
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

async function acquireKey(pool: KeyState[]): Promise<KeyState> {
  if (!pool.length) throw new Error("Jupiter routing is not configured.");

  const now = Date.now();
  const available = pool.filter((k) => k.cooldownUntil <= now);
  const activePool = available.length > 0 ? available : pool;

  activePool.sort((a, b) => a.nextRequestAt - b.nextRequestAt);
  const selected = activePool[0];

  const slot = Math.max(now, selected.nextRequestAt);
  if (slot - now > 15_000) {
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
  const pool = getKeyPool(fallbackKey);
  const attempts = Math.min(pool.length * 2, 4);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const keyState = await acquireKey(pool);

    const response = await fetch(`https://api.jup.ag/swap/v2/build?${params}`, {
      headers: { "x-api-key": keyState.key },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status !== 429) return response;

    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const retry = Number(response.headers.get("retry-after") ?? 5);
    const cooldownMs = reset
      ? Math.max(2000, reset * 1000 - Date.now() + 250)
      : retry * 1000;

    keyState.cooldownUntil = Date.now() + cooldownMs;
  }

  throw new Error(
    "Jupiter is limiting quote requests. Wait a moment before reviewing this basket again.",
  );
}
