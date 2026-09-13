import { KiteClient, KiteApiError } from "@kite/sdk";
import { resolvePublicOrigin } from "./endpoints";

declare const process: {
  env: { EXPO_PUBLIC_API_BASE_URL?: string; EXPO_PUBLIC_WEB_URL?: string };
};

const api = resolvePublicOrigin(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__);
const web = resolvePublicOrigin(
  process.env.EXPO_PUBLIC_WEB_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL,
  __DEV__,
);
export const API_BASE_URL = api.origin;
export const WEB_URL = web.origin;
export const API_CONFIGURATION_ERROR = api.error;
export const WEB_CONFIGURATION_ERROR = web.error;

/** The shared client parses HTML protection/tunnel errors and never embeds provider keys. */
export const kiteClient = new KiteClient({
  baseUrl: API_BASE_URL,
  allowInsecureHttp: __DEV__,
  fetcher: (input, init) => {
    if (API_CONFIGURATION_ERROR)
      return Promise.reject(new KiteApiError(API_CONFIGURATION_ERROR));
    return fetch(input, init).catch((error: unknown) => {
      if (init?.signal?.aborted) throw error;
      throw new KiteApiError(
        "Cannot reach Kite. Check your connection and that the API tunnel is still running. Expo’s tunnel does not expose the web API.",
      );
    });
  },
});
