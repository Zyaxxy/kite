declare const process: { env: { EXPO_PUBLIC_API_BASE_URL?: string; EXPO_PUBLIC_WEB_URL?: string } };

/** The mobile client uses the web API so provider credentials never ship in the app. */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? API_BASE_URL).replace(/\/$/, '');

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!API_BASE_URL) throw new Error('Set EXPO_PUBLIC_API_BASE_URL to your running Kite web app to load live markets.');
  const response = await fetch(`${API_BASE_URL}${path}`, { signal });
  if (!response.ok) throw new Error(`The market service returned ${response.status}. Pull down to retry.`);
  return response.json() as Promise<T>;
}
