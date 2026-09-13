/** Deployment-independent controls. A distributed gateway should also enforce production limits. */
export function allowedOrigin(origin: string | null, requestOrigin: string, configured: string, development: boolean): boolean {
  if (!origin || origin === requestOrigin) return true; // Native clients do not send Origin.
  const allowed = configured.split(',').map(value => value.trim()).filter(Boolean);
  if (development) allowed.push('http://localhost:8081', 'http://127.0.0.1:8081', 'http://localhost:19006');
  return allowed.includes(origin);
}
export function isLoopback(hostname: string): boolean { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname); }
export function createRequestLimiter(limit: number, windowMs = 60_000, maximumKeys = 10_000) {
  const buckets = new Map<string, { count: number; until: number }>();
  return (key: string, now = Date.now()): number => {
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (buckets.size >= maximumKeys) {
        for (const [id, item] of buckets) if (item.until <= now) buckets.delete(id);
        if (buckets.size >= maximumKeys && !buckets.has(key)) return Math.ceil(windowMs / 1000);
      }
      bucket = { count: 0, until: now + windowMs }; buckets.set(key, bucket);
    }
    bucket.count++;
    return bucket.count > limit ? Math.max(1, Math.ceil((bucket.until - now) / 1000)) : 0;
  };
}
/** Count streamed bytes as well as Content-Length; chunked bodies cannot bypass the cap. */
export async function readLimitedJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  if (!request.body) throw new Error('A JSON request body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('The request body is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
