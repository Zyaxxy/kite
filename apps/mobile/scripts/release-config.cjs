const { isIP } = require("node:net");

function isPrivateHost(host) {
  const hostname = host
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    (!hostname.includes(".") && !isIP(hostname))
  )
    return true;
  if (isIP(hostname) === 4) {
    const [a, b] = hostname.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (isIP(hostname) === 6)
    return (
      hostname === "::" ||
      hostname === "::1" ||
      /^(fc|fd|fe[89ab])/.test(hostname) ||
      hostname.startsWith("::ffff:")
    );
  return false;
}

/** Build-time validation only; local Expo previews may show the runtime setup screen. */
function validateReleaseEnvironment(env = process.env) {
  const release =
    env.KITE_REQUIRE_RELEASE_CONFIG === "true" ||
    ["preview", "production"].includes(env.EAS_BUILD_PROFILE);
  if (!release) return;
  for (const key of ["EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_WEB_URL"]) {
    let valid = false;
    try {
      const value = env[key];
      const url = new URL(typeof value === "string" ? value.trim() : "");
      valid =
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/" &&
        !isPrivateHost(url.hostname);
    } catch {
      /* Error messages never echo potentially sensitive pasted values. */
    }
    if (!valid)
      throw new Error(
        `Kite release configuration: ${key} must be an explicit public HTTPS origin without credentials, paths or query parameters. Set it as a plaintext variable in the selected EAS environment before building.`,
      );
  }
}
module.exports = { validateReleaseEnvironment };
