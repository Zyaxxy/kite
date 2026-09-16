const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const code = ts.transpileModule(
  fs.readFileSync(require.resolve("../src/lib/recurring-config.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  },
).outputText;
const context = { exports: {}, Error };
vm.runInNewContext(code, context);
const { parseDevnetRecurringConfig } = context.exports;
const configuration = {
  schemaVersion: 1,
  protocolVersion: 2,
  testTokensOnly: true,
  network: "devnet",
  readyToPrepare: false,
  reasons: ["Authorization is not configured."],
  stocks: [{ id: "AAPL", available: true }],
  baskets: [],
};
test("mobile recurring rejects mainnet, legacy protocol and non-test-token responses", () => {
  for (const change of [
    { network: "mainnet-beta" },
    { protocolVersion: 1 },
    { schemaVersion: 2 },
    { testTokensOnly: false },
    { testTokensOnly: undefined },
    { readyToPrepare: "true" },
    { reasons: "ready" },
  ]) {
    assert.throws(
      () => parseDevnetRecurringConfig({ ...configuration, ...change }),
      /valid devnet configuration/,
    );
  }
});
test("blocked devnet configuration preserves backend reasons without manufacturing readiness", () => {
  const parsed = parseDevnetRecurringConfig(configuration);
  assert.equal(parsed.readyToPrepare, false);
  assert.equal(parsed.reasons[0], "Authorization is not configured.");
  assert.equal(parsed.stocks.length, 1);
});
test("malformed catalog entries do not increase supported target counts", () => {
  const parsed = parseDevnetRecurringConfig({
    ...configuration,
    stocks: [
      null,
      { id: "AAPL", available: "true" },
      { id: "NVDA", available: true },
    ],
    baskets: "invalid",
  });
  assert.equal(parsed.stocks.length, 1);
  assert.equal(parsed.stocks[0].id, "NVDA");
  assert.equal(parsed.baskets.length, 0);
});
