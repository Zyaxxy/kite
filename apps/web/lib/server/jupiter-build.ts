/** Pace unsigned route construction within each process; no transaction is submitted here. */
let nextRequestAt = 0;
async function pace() {
  const now = Date.now(),
    slot = Math.max(now, nextRequestAt);
  if (slot - now > 15_000)
    throw new Error("Basket routing is busy. Please try again shortly.");
  nextRequestAt = slot + 1100;
  if (slot > now)
    await new Promise((resolve) => setTimeout(resolve, slot - now));
}
export async function fetchJupiterBuild(
  params: URLSearchParams,
  key: string,
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await pace();
    const response = await fetch(`https://api.jup.ag/swap/v2/build?${params}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 429) return response;
    const retry = Number(response.headers.get("retry-after") ?? 1);
    if (attempt === 1 || !Number.isFinite(retry) || retry > 3)
      throw new Error(
        "Jupiter is limiting quote requests. Wait a moment before reviewing this basket again.",
      );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1100, retry * 1000)),
    );
  }
  throw new Error("Jupiter is temporarily unavailable.");
}
