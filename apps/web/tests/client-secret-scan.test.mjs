import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  configuredServerSecrets,
  scanClientArtifacts,
} from "../../../scripts/check-client-secrets.mjs";

test("artifact scan catches literal and compressed server secrets and excludes public config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kite-secret-scan-"));
  try {
    const server = "test-only-server-credential-42";
    const secrets = await configuredServerSecrets({
      envFiles: [],
      environment: {
        KITE_TRADE_SECRET: server,
        NEXT_PUBLIC_PRIVY_APP_ID: "public-id",
        EXPO_PUBLIC_API_URL: "https://public.example",
      },
    });
    assert.equal(secrets.size, 1);
    await writeFile(join(dir, "clean.js"), 'const publicId="public-id";');
    assert.equal((await scanClientArtifacts([dir], secrets)).matches.length, 0);
    await writeFile(
      join(dir, "leak.js"),
      `const key=${JSON.stringify(server)};`,
    );
    await writeFile(
      join(dir, "leak.js.gz"),
      gzipSync(`const key=${JSON.stringify(server)};`),
    );
    const result = await scanClientArtifacts([dir], secrets);
    assert.equal(result.matches.length, 2);
    assert.deepEqual(result.matches[0].variables, ["KITE_TRADE_SECRET"]);
    assert.ok(!JSON.stringify(result).includes(server));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
