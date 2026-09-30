import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as { port: number }).port;
}

test(
  "mobile tunnel carries five full V1 payloads only on bundle routes",
  { timeout: 15000 },
  async (t) => {
    const received: string[] = [];
    const upstream = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      received.push(Buffer.concat(chunks).toString());
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
    const upstreamPort = await listen(upstream);
    const reservation = createServer();
    const proxyPort = await listen(reservation);
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../../scripts/dev-api-tunnel.mjs", import.meta.url),
        ),
        "--proxy-only",
      ],
      {
        env: {
          NODE_ENV: "test",
          KITE_API_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
          KITE_API_TUNNEL_PORT: String(proxyPort),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    t.after(async () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        const kill = setTimeout(() => child.kill("SIGKILL"), 2000);
        await once(child, "close");
        clearTimeout(kill);
      }
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Tunnel did not start")),
        5000,
      );
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += String(chunk);
        if (
          output.includes(`proxy listening at http://127.0.0.1:${proxyPort}`)
        ) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Tunnel exited before startup"));
      });
    });
    const body = JSON.stringify({
      signedTransactions: Array(5).fill(
        Buffer.alloc(4096, 1).toString("base64"),
      ),
      authorization: "a".repeat(5000),
    });
    assert.ok(
      Buffer.byteLength(body) > 16_384 && Buffer.byteLength(body) <= 32_768,
    );
    const post = (path: string, payload = body) =>
      fetch(`http://127.0.0.1:${proxyPort}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(3000),
      });
    for (const path of ["/api/bundles/execute", "/api/bundles/status"]) {
      assert.equal((await post(path)).status, 200);
      assert.equal(received.at(-1), body);
      assert.equal((await post(path, " ".repeat(32_769))).status, 413);
    }
    assert.equal((await post("/api/trade/order")).status, 413);
    assert.equal((await post("/api/recurring/collect", "{}")).status, 404);
    assert.equal(received.length, 2);
  },
);
