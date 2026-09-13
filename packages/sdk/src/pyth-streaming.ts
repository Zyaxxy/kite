import type { PythPriceData } from "./pyth-oracle";

export interface PythEventSource {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}
export interface PythStreamOptions {
  endpoint?: string;
  createEventSource?: (url: string) => PythEventSource;
  maxAgeSeconds?: number;
  maxConfidenceRatio?: number;
  now?: () => number;
}
const feedId = (id: string) => id.replace(/^0x/, "").toLowerCase();

/** Hermes SSE with freshness/confidence guards. Native callers inject an SSE
 * implementation; the SDK does not install browser globals into Expo bundles. */
export function subscribePythPriceFeeds(
  feedIds: readonly string[],
  onPrice: (price: PythPriceData) => void,
  onError?: (error: Error) => void,
  options: PythStreamOptions = {},
): () => void {
  const ids = [...new Set(feedIds.map(feedId))];
  if (
    !ids.length ||
    ids.length > 100 ||
    ids.some((id) => !/^[a-f0-9]{64}$/.test(id))
  )
    throw new Error("Provide between 1 and 100 valid Pyth feed IDs.");
  const endpoint = new URL(options.endpoint ?? "https://hermes.pyth.network");
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error(
      "Pyth streaming requires an HTTPS endpoint without credentials.",
    );
  const maxAge = options.maxAgeSeconds ?? 60;
  const maxConfidence = options.maxConfidenceRatio ?? 0.1;
  if (
    !Number.isFinite(maxAge) ||
    maxAge <= 0 ||
    !Number.isFinite(maxConfidence) ||
    maxConfidence <= 0 ||
    maxConfidence > 1
  )
    throw new Error("Invalid oracle freshness or confidence limits.");
  const factory =
    options.createEventSource ??
    ((url: string) => {
      if (typeof EventSource === "undefined")
        throw new Error(
          "This platform requires an EventSource adapter for Pyth streaming.",
        );
      return new EventSource(url) as unknown as PythEventSource;
    });
  const url = new URL("/v2/updates/price/stream", endpoint);
  for (const id of ids) url.searchParams.append("ids[]", id);
  url.searchParams.set("parsed", "true");
  url.searchParams.set("allow_unordered", "false");
  const source = factory(url.toString());
  const requested = new Set(ids);
  const latest = new Map<string, number>();
  let closed = false;
  source.onmessage = (event) => {
    if (closed) return;
    try {
      if (event.data.length > 1_000_000)
        throw new Error("Oracle update exceeds the expected size.");
      const payload: unknown = JSON.parse(event.data);
      if (
        !payload ||
        typeof payload !== "object" ||
        !Array.isArray((payload as { parsed?: unknown }).parsed)
      )
        throw new Error("Malformed oracle update.");
      for (const item of (payload as { parsed: unknown[] }).parsed) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (
          typeof row.id !== "string" ||
          !requested.has(feedId(row.id)) ||
          !row.price ||
          typeof row.price !== "object"
        )
          continue;
        const raw = row.price as Record<string, unknown>;
        if (
          typeof raw.price !== "string" ||
          !/^[0-9]{1,40}$/.test(raw.price) ||
          typeof raw.conf !== "string" ||
          !/^[0-9]{1,40}$/.test(raw.conf) ||
          typeof raw.expo !== "number" ||
          !Number.isInteger(raw.expo) ||
          raw.expo < -18 ||
          raw.expo > 18 ||
          typeof raw.publish_time !== "number" ||
          !Number.isSafeInteger(raw.publish_time)
        )
          continue;
        const id = feedId(row.id);
        const publishTime = raw.publish_time;
        const now = Math.floor((options.now?.() ?? Date.now()) / 1_000);
        const price = Number(raw.price) * 10 ** raw.expo;
        const confidence = Number(raw.conf) * 10 ** raw.expo;
        if (
          !Number.isFinite(price) ||
          price <= 0 ||
          !Number.isFinite(confidence) ||
          confidence / price > maxConfidence ||
          now - publishTime > maxAge ||
          publishTime > now + 10 ||
          publishTime <= (latest.get(id) ?? -Infinity)
        )
          continue;
        latest.set(id, publishTime);
        onPrice({
          feedId: `0x${id}`,
          price,
          confidence,
          expo: raw.expo,
          rawPrice: raw.price,
          rawConfidence: raw.conf,
          publishTime,
          status: "unknown",
        });
      }
    } catch (error) {
      onError?.(
        error instanceof Error ? error : new Error("Invalid oracle update."),
      );
    }
  };
  source.onerror = () => {
    if (!closed)
      onError?.(
        new Error("Pyth price stream disconnected; waiting for reconnection."),
      );
  };
  return () => {
    closed = true;
    source.onmessage = null;
    source.onerror = null;
    source.close();
    latest.clear();
  };
}
