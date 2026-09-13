const test = require("node:test");
const assert = require("node:assert/strict");
const { advertisedSigningVersions } = require("../dist/wallet-capabilities");
test("only the advertised signing method can enable a transaction version", () => {
  assert.deepEqual(advertisedSigningVersions(["legacy", 0, 1], true), [0, 1]);
  assert.deepEqual(advertisedSigningVersions(["1"], true), [1]);
  assert.deepEqual(advertisedSigningVersions([1], false), []);
  assert.deepEqual(advertisedSigningVersions(undefined, true), []);
  assert.deepEqual(
    advertisedSigningVersions([0, "legacy", 2, NaN, "01"], true),
    [0],
  );
});
