#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile, lstat, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "Usage: node scripts/dev-api-tunnel.mjs [--write-env] [--proxy-only]\n\nKITE_API_UPSTREAM=http://127.0.0.1:3000  Local Kite server\nKITE_API_TUNNEL_PORT=3101              Local proxy port\nCLOUDFLARED_BIN=cloudflared            Installed official Cloudflare CLI\n\nOnly public Kite API routes are exposed. --write-env saves the public URL to the ignored apps/mobile/.env.local. Restart Expo after changing its public environment. Set EXPO_PUBLIC_WEB_URL separately for Privy on web.",
  );
  process.exit(0);
}
if (args.some((arg) => !["--write-env", "--proxy-only"].includes(arg)))
  throw new Error("Unsupported argument. Use --help.");
const upstream = new URL(
  process.env.KITE_API_UPSTREAM || "http://127.0.0.1:3000",
);
if (
  upstream.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(upstream.hostname) ||
  upstream.username ||
  upstream.password ||
  upstream.search ||
  upstream.hash ||
  upstream.pathname !== "/"
)
  throw new Error(
    "KITE_API_UPSTREAM must be an HTTP loopback origin without credentials.",
  );
const port = Number(process.env.KITE_API_TUNNEL_PORT || 3101);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error(
    "Choose an unprivileged local proxy port between 1024 and 65535.",
  );
const readPaths = new Set([
  "/api/health",
  "/api/markets",
  "/api/research",
  "/api/tokens",
  "/api/portfolio",
  "/api/recurring",
]);
const writePaths = new Set([
  "/api/trade/order",
  "/api/trade/execute",
  "/api/buy-basket",
  "/api/transaction/execute",
  "/api/recurring",
  "/api/recurring/revoke",
  "/api/recurring/collect",
]);
const allowedHeaders = [
  "content-type",
  "cache-control",
  "etag",
  "retry-after",
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-expose-headers",
  "vary",
];
const fail = (response, status, error) => {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify({ error }));
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", upstream);
    const method = request.method || "GET";
    if (
      url.origin !== upstream.origin ||
      url.search.length > 2048 ||
      !(
        (method === "GET" && readPaths.has(url.pathname)) ||
        (method === "POST" && writePaths.has(url.pathname)) ||
        (method === "OPTIONS" &&
          (readPaths.has(url.pathname) || writePaths.has(url.pathname)))
      )
    )
      return fail(
        response,
        404,
        "This API route is not exposed by the development tunnel.",
      );
    if (
      method === "POST" &&
      !request.headers["content-type"]
        ?.toLowerCase()
        .startsWith("application/json")
    )
      return fail(response, 415, "A JSON request is required.");
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 16_384)
        return fail(response, 413, "Request body is too large.");
      chunks.push(chunk);
    }
    const headers = { Accept: "application/json" };
    for (const name of [
      "content-type",
      "if-none-match",
      "origin",
      "access-control-request-method",
      "access-control-request-headers",
    ]) {
      const value = request.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    // Preserve HTTPS at the public edge without forwarding cookies or provider credentials.
    headers["x-forwarded-proto"] = "https";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65_000);
    response.once("close", () => controller.abort());
    try {
      const result = await fetch(url, {
        method,
        headers,
        ...(method === "POST" ? { body: Buffer.concat(chunks) } : {}),
        signal: controller.signal,
        redirect: "manual",
      });
      if (
        result.status !== 304 &&
        result.status !== 204 &&
        !result.headers.get("content-type")?.includes("application/json")
      )
        return fail(
          response,
          502,
          "The local API returned a web page. Check the upstream server and deployment access settings.",
        );
      const outgoing = { "X-Content-Type-Options": "nosniff" };
      for (const name of allowedHeaders) {
        const value = result.headers.get(name);
        if (value) outgoing[name] = value;
      }
      response.writeHead(result.status, outgoing);
      if (result.body) {
        for await (const chunk of result.body) {
          if (response.destroyed) break;
          response.write(chunk);
        }
      }
      response.end();
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    if (!response.headersSent)
      fail(response, 502, "The local Kite API is unavailable or timed out.");
    else response.end();
  }
});
server.requestTimeout = 70_000;
server.headersTimeout = 10_000;
server.maxHeadersCount = 32;
server.listen(port, "127.0.0.1");
await new Promise((yes, no) => {
  server.once("listening", yes);
  server.once("error", no);
});
console.log(`Kite public API proxy listening at http://127.0.0.1:${port}`);
let tunnel;
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  tunnel?.kill("SIGTERM");
  server.close();
  server.closeAllConnections();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
if (!args.includes("--proxy-only")) {
  tunnel = spawn(
    process.env.CLOUDFLARED_BIN || "cloudflared",
    ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let announced = false;
  async function readLog(chunk) {
    const url = chunk
      .toString()
      .match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (!url || announced) return;
    announced = true;
    console.log(`Public API URL: ${url}`);
    if (!args.includes("--write-env")) return;
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const destination = resolve(root, "apps/mobile/.env.local");
    try {
      if (
        spawnSync(
          "git",
          ["check-ignore", "--quiet", "apps/mobile/.env.local"],
          { cwd: root },
        ).status !== 0
      )
        throw new Error("The mobile environment file must be gitignored.");
      try {
        if ((await lstat(destination)).isSymbolicLink())
          throw new Error("Refusing to replace a symlink.");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      let previous = "";
      try {
        previous = await readFile(destination, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const line = `EXPO_PUBLIC_API_BASE_URL=${url}`;
      const next = /^EXPO_PUBLIC_API_BASE_URL=.*$/m.test(previous)
        ? previous.replace(/^EXPO_PUBLIC_API_BASE_URL=.*$/m, line)
        : `${previous.trimEnd()}${previous.trim() ? "\n" : ""}${line}\n`;
      await writeFile(`${destination}.tmp`, next, { mode: 0o600 });
      await rename(`${destination}.tmp`, destination);
      console.log(
        "Updated ignored apps/mobile/.env.local. Restart Expo; keep this tunnel process running.",
      );
    } catch {
      console.error(
        "Could not update the ignored mobile environment. Set the displayed public API URL manually.",
      );
    }
  }
  tunnel.stdout.on("data", (chunk) => {
    void readLog(chunk);
  });
  tunnel.stderr.on("data", (chunk) => {
    void readLog(chunk);
  });
  tunnel.once("error", () => {
    console.error(
      "Could not run cloudflared. Install the official Cloudflare CLI or set CLOUDFLARED_BIN.",
    );
    process.exitCode = 1;
    stop();
  });
  tunnel.once("exit", (code) => {
    if (!stopping && code)
      console.error(
        "The Cloudflare tunnel stopped before completion. Check your network and Cloudflare configuration.",
      );
    stop();
  });
}
