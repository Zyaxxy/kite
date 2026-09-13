/** Only public origins belong in an Expo bundle; secrets stay on the web server. */
export function resolvePublicOrigin(
  value: string | undefined,
  development: boolean,
): { origin: string; error: string | null } {
  if (!value?.trim())
    return {
      origin: "",
      error:
        "Set EXPO_PUBLIC_API_BASE_URL to your Kite HTTPS API origin, then restart Expo.",
    };
  try {
    const url = new URL(value.trim());
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      throw new Error(
        "Use an origin only, without credentials, paths or query parameters.",
      );
    }
    const local =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      /^10\./.test(url.hostname) ||
      /^192\.168\./.test(url.hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
    if (
      url.protocol !== "https:" &&
      !(development && local && url.protocol === "http:")
    ) {
      throw new Error(
        "Use HTTPS for your API. Local HTTP addresses are allowed only in development.",
      );
    }
    return { origin: url.origin, error: null };
  } catch (error) {
    return {
      origin: "",
      error:
        error instanceof Error
          ? error.message
          : "Use a valid HTTPS API origin.",
    };
  }
}
