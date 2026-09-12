declare const process: { env: { EXPO_PUBLIC_API_BASE_URL?: string; EXPO_PUBLIC_WEB_URL?: string } };

/** The mobile client uses the web API so provider credentials never ship in the app. */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? API_BASE_URL).replace(/\/$/, '');

async function apiResponse(path: string, signal?: AbortSignal, etag?: string | null): Promise<Response> {
  if (!API_BASE_URL) throw new Error('Set EXPO_PUBLIC_API_BASE_URL to your running Kite web app to load live markets.');
  const response = await fetch(`${API_BASE_URL}${path}`, { signal, headers: etag ? { 'If-None-Match': etag } : undefined });
  if (!response.ok && !(etag && response.status === 304)) throw new Error(`The market service returned ${response.status}. Pull down to retry.`);
  return response;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await apiResponse(path, signal);
  return response.json() as Promise<T>;
}

/** Conditional reads skip body decoding when a previously received response is unchanged. */
export async function apiGetConditional<T>(path: string, signal?: AbortSignal, etag?: string | null): Promise<
  { notModified: true; etag: string | null } | { notModified: false; etag: string | null; data: T }
> {
  const response = await apiResponse(path, signal, etag);
  const nextEtag = response.headers.get('etag');
  if (response.status === 304) return { notModified: true, etag: nextEtag ?? etag ?? null };
  return { notModified: false, etag: nextEtag, data: await response.json() as T };
}
