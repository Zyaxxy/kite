import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

test(
  "local-only mobile API proxy permits investing setup but excludes executor access and credentials",
  { timeout: 20000 },
  async (t) => {
    const requests = [];
    const upstream = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response.setHeader(
        "Access-Control-Allow-Origin",
        "http://127.0.0.1:8081",
      );
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.setHeader("Set-Cookie", "server-only-session=test-cookie");
      response.setHeader("Authorization", "Bearer upstream-private-token");
      response.setHeader("X-Api-Key", "upstream-private-key");
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
      } else {
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        response.end(JSON.stringify({ ok: true }));
      }
    });
    const upstreamPort = await listen(upstream);
    const reservation = createServer();
    const proxyPort = await listen(reservation);
    await new Promise((resolve) => reservation.close(resolve));
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../scripts/dev-api-tunnel.mjs", import.meta.url)),
        "--proxy-only",
      ],
      {
        // An explicit environment keeps the test independent of real provider credentials.
        env: {
          KITE_API_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
          KITE_API_TUNNEL_PORT: String(proxyPort),
          CLOUDFLARED_BIN: "/must-not-run-a-public-tunnel",
          JUPITER_API_KEY: "test-only-environment-jupiter-key",
          PRIVY_APP_SECRET: "test-only-environment-privy-secret",
          KITE_RECURRING_EXECUTOR_SECRET:
            "test-only-environment-executor-secret",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    t.after(async () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        const timeout = setTimeout(() => child.kill("SIGKILL"), 2000);
        await once(child, "close");
        clearTimeout(timeout);
      }
      upstream.closeAllConnections();
      await new Promise((resolve) => upstream.close(resolve));
    });
    await new Promise((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(
        () => reject(new Error("The local API proxy did not start")),
        5000,
      );
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (
          output.includes(`proxy listening at http://127.0.0.1:${proxyPort}`)
        ) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Local proxy exited before startup: ${code}`));
      });
    });
    const origin = `http://127.0.0.1:${proxyPort}`;
    const request = (url, init = {}) =>
      fetch(origin + url, {
        ...init,
        signal: AbortSignal.timeout(3000),
        redirect: "manual",
      });

    await t.test(
      "GET config and plans plus JSON POST plans reach the local API",
      async () => {
        for (const url of [
          "/api/health",
          "/api/recurring?wallet=test-wallet",
        ])
          assert.equal((await request(url)).status, 200);
        const body = JSON.stringify({
          action: "create",
          target: { type: "stock", id: "test-stock" },
          schedule: { unit: "month", interval: 1 },
        });
        assert.equal(
          (
            await request("/api/recurring", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            })
          ).status,
          200,
        );
        assert.equal(requests[0].url, "/api/health");
        assert.equal(
          requests[1].url,
          "/api/recurring?wallet=test-wallet",
        );
        assert.equal(requests[2].method, "POST");
        assert.equal(requests[2].body, body);
        assert.equal(
          requests.every(
            (entry) => entry.headers["x-forwarded-proto"] === "https",
          ),
          true,
        );
      },
    );

    await t.test(
      "CORS preflights for public investment routes preserve negotiation headers",
      async () => {
        for (const url of ["/api/health", "/api/recurring"]) {
          const response = await request(url, {
            method: "OPTIONS",
            headers: {
              Origin: "http://127.0.0.1:8081",
              "Access-Control-Request-Method": url.endsWith("plans")
                ? "POST"
                : "GET",
              "Access-Control-Request-Headers": "Content-Type",
            },
          });
          assert.equal(response.status, 204);
          assert.equal(
            response.headers.get("access-control-allow-origin"),
            "http://127.0.0.1:8081",
          );
          assert.equal(
            response.headers.get("access-control-allow-methods"),
            "GET, POST, OPTIONS",
          );
          const received = requests.at(-1);
          assert.equal(received.method, "OPTIONS");
          assert.equal(received.headers.origin, "http://127.0.0.1:8081");
          assert.equal(
            received.headers["access-control-request-headers"],
            "Content-Type",
          );
        }
      },
    );

    await t.test(
      "executor GET, POST and OPTIONS return 404 without contacting upstream",
      async () => {
        const before = requests.length;
        for (const method of ["GET", "POST", "OPTIONS"])
          for (const url of [
            "/api/investing/executor",
            "/api/investing/executor?planId=test",
            "/api/investing/executor/",
            "/api/investing/%65xecutor",
          ])
            assert.equal(
              (
                await request(url, {
                  method,
                  headers: {
                    Authorization: "Bearer must-not-reach-executor",
                    ...(method === "POST"
                      ? { "Content-Type": "application/json" }
                      : {}),
                  },
                  ...(method === "POST"
                    ? { body: JSON.stringify({ action: "record" }) }
                    : {}),
                })
              ).status,
              404,
            );
        assert.equal(requests.length, before);
      },
    );

    await t.test(
      "request and response credentials are stripped even on allowed routes",
      async () => {
        const response = await request("/api/health", {
          headers: {
            Authorization: "Bearer request-private-token",
            "Proxy-Authorization": "Basic request-proxy-token",
            Cookie: "private-session=request-cookie",
            "X-Api-Key": "request-provider-key",
            "X-Jupiter-Api-Key": "request-jupiter-key",
            "Privy-App-Secret": "request-privy-secret",
            "X-Forwarded-Host": "attacker.invalid",
          },
        });
        assert.equal(response.status, 200);
        const received = requests.at(-1).headers;
        for (const header of [
          "authorization",
          "proxy-authorization",
          "cookie",
          "x-api-key",
          "x-jupiter-api-key",
          "privy-app-secret",
          "x-forwarded-host",
        ])
          assert.equal(
            received[header],
            undefined,
            `${header} must not reach the local API`,
          );
        for (const header of ["set-cookie", "authorization", "x-api-key"])
          assert.equal(
            response.headers.get(header),
            null,
            `${header} must not reach the mobile client`,
          );
        assert.equal(
          JSON.stringify(requests).includes("test-only-environment"),
          false,
        );
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      },
    );

    await t.test(
      "incorrect methods and non-JSON plan writes do not expand the allowlist",
      async () => {
        const before = requests.length;
        assert.equal(
          (
            await request("/api/health", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            })
          ).status,
          404,
        );
        assert.equal(
          (await request("/api/recurring", { method: "DELETE" })).status,
          404,
        );
        assert.equal(
          (
            await request("/api/recurring", {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: "{}",
            })
          ).status,
          415,
        );
        assert.equal(requests.length, before);
      },
    );
  },
);
