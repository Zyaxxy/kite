const test = require("node:test");
const assert = require("node:assert/strict");
const { validateReleaseEnvironment } = require("../scripts/release-config.cjs");
const profiles = require("../eas.json");
const publicConfig = {
  EXPO_PUBLIC_API_BASE_URL: "https://api.kite.example",
  EXPO_PUBLIC_WEB_URL: "https://app.kite.example",
};

test("local Expo config and exports remain available before release endpoints are configured", () => {
  assert.doesNotThrow(() => validateReleaseEnvironment({}));
  assert.doesNotThrow(() =>
    validateReleaseEnvironment({ EAS_BUILD_PROFILE: "development" }),
  );
});
test("preview APK and production AAB profiles both enforce explicit release origins", () => {
  assert.equal(profiles.build.preview.android.buildType, "apk");
  assert.equal(profiles.build.preview.distribution, "internal");
  assert.equal(profiles.build.production.android.buildType, "app-bundle");
  for (const profile of ["preview", "production"]) {
    assert.equal(
      profiles.build[profile].env.KITE_REQUIRE_RELEASE_CONFIG,
      "true",
    );
    assert.throws(
      () => validateReleaseEnvironment({ EAS_BUILD_PROFILE: profile }),
      /EXPO_PUBLIC_API_BASE_URL/,
    );
    assert.throws(
      () =>
        validateReleaseEnvironment({
          EAS_BUILD_PROFILE: profile,
          EXPO_PUBLIC_API_BASE_URL: publicConfig.EXPO_PUBLIC_API_BASE_URL,
        }),
      /EXPO_PUBLIC_WEB_URL/,
    );
    assert.doesNotThrow(() =>
      validateReleaseEnvironment({
        EAS_BUILD_PROFILE: profile,
        ...publicConfig,
      }),
    );
  }
});
test("the local EAS configuration flag enforces validation before EAS_BUILD_PROFILE is set", () => {
  assert.throws(
    () => validateReleaseEnvironment({ KITE_REQUIRE_RELEASE_CONFIG: "true" }),
    /release configuration/,
  );
});
test("release origins reject cleartext, local targets, credential URLs and paths without leaking values", () => {
  for (const value of [
    "http://api.kite.example",
    "https://localhost",
    "https://localhost.",
    "https://127.0.0.1",
    "https://192.168.1.4",
    "https://[::1]",
    "https://wallet.local",
    "https://secret:password@api.kite.example",
    "https://api.kite.example/api",
    "https://api.kite.example?secret=private",
  ]) {
    assert.throws(
      () =>
        validateReleaseEnvironment({
          EAS_BUILD_PROFILE: "production",
          ...publicConfig,
          EXPO_PUBLIC_API_BASE_URL: value,
        }),
      (error) =>
        error.message.includes("EXPO_PUBLIC_API_BASE_URL") &&
        !error.message.includes(value),
    );
  }
});
