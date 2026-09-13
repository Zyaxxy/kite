import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import ts from "typescript";
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../lib/server/investing-health.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
function load(directory) {
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (name) =>
      name === "./investing-store"
        ? { investingStateDirectory: () => directory }
        : require(name),
    Date,
    Error,
  });
  return exports;
}
test("worker health expires, rejects future timestamps and follows executor rotation", () => {
  const { executorHeartbeatHealth: health } = load("/unused");
  assert.equal(
    health({ buyer: "buyer", lastSeenAt: 1000 }, "buyer", 1179).healthy,
    true,
  );
  assert.equal(
    health({ buyer: "buyer", lastSeenAt: 1000 }, "buyer", 1180).healthy,
    false,
  );
  assert.equal(
    health({ buyer: "buyer", lastSeenAt: 1000 }, "other", 1000).healthy,
    false,
  );
  for (const value of [
    null,
    {},
    [],
    { buyer: "buyer", lastSeenAt: 1001 },
    { buyer: "buyer", lastSeenAt: -1 },
    { buyer: "buyer", lastSeenAt: "1000" },
  ])
    assert.equal(health(value, "buyer", 1000).healthy, false);
});
test("worker heartbeat persists privately and unavailable storage fails closed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kite-heartbeat-"));
  await chmod(directory, 0o700);
  const { recordExecutorHeartbeat, readExecutorHeartbeat } = load(directory);
  try {
    assert.equal((await readExecutorHeartbeat("buyer")).healthy, false);
    await recordExecutorHeartbeat("buyer");
    assert.equal((await readExecutorHeartbeat("buyer")).healthy, true);
    assert.equal((await readExecutorHeartbeat("rotated-buyer")).healthy, false);
    const file = path.join(directory, "executor-heartbeat.json");
    await writeFile(file, "bad JSON");
    assert.equal((await readExecutorHeartbeat("buyer")).healthy, false);
    await recordExecutorHeartbeat("buyer");
    await chmod(file, 0o644);
    assert.equal((await readExecutorHeartbeat("buyer")).healthy, false);
    await chmod(directory, 0o755);
    await assert.rejects(
      recordExecutorHeartbeat("buyer"),
      /private persistent/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
