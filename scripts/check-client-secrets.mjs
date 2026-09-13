#!/usr/bin/env node
import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { gunzipSync, brotliDecompressSync } from "node:zlib";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverSecretName = (name) =>
  !name.startsWith("NEXT_PUBLIC_") &&
  !name.startsWith("EXPO_PUBLIC_") &&
  /(?:^|_)(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)(?:_|$)/.test(name);

/** Read configuration privately; callers must never print this map or its values. */
export async function configuredServerSecrets({
  environment = process.env,
  envFiles,
} = {}) {
  const files =
    envFiles ??
    [".env", ".env.local", ".env.production", ".env.production.local"].flatMap(
      (name) => [
        resolve(projectRoot, name),
        resolve(projectRoot, "apps/web", name),
      ],
    );
  const sources = [environment];
  for (const file of files) {
    try {
      sources.push(parseEnv(await readFile(file, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT")
        throw new Error("An environment file could not be read.");
    }
  }
  const secrets = new Map();
  for (const source of sources)
    for (const [name, value] of Object.entries(source)) {
      if (!serverSecretName(name) || typeof value !== "string" || !value)
        continue;
      const names = secrets.get(value) ?? new Set();
      names.add(name);
      secrets.set(value, names);
    }
  return secrets;
}

/** Scan bytes too: native Hermes bundles and source maps may contain literal strings. */
export async function scanClientArtifacts(paths, secrets) {
  const files = [];
  const visit = async (path) => {
    const stat = await lstat(path);
    if (stat.isSymbolicLink())
      throw new Error(
        "A client artifact path contains a symlink. Supply a fully exported artifact directory.",
      );
    if (stat.isDirectory()) {
      for (const entry of await readdir(path))
        await visit(resolve(path, entry));
    } else if (stat.isFile()) files.push(path);
  };
  for (const path of paths) await visit(resolve(path));
  if (!files.length)
    throw new Error(
      "No client artifacts were found. Build or export the client first.",
    );
  const matches = [];
  for (const file of new Set(files)) {
    const raw = await readFile(file);
    let bytes = raw;
    if (extname(file) === ".gz") bytes = gunzipSync(raw);
    if (extname(file) === ".br") bytes = brotliDecompressSync(raw);
    const variables = new Set();
    for (const [value, names] of secrets) {
      const variants = new Set([
        value,
        JSON.stringify(value).slice(1, -1),
        encodeURIComponent(value),
      ]);
      if ([...variants].some((variant) => bytes.includes(Buffer.from(variant))))
        for (const name of names) variables.add(name);
    }
    if (variables.size)
      matches.push({ file, variables: [...variables].sort() });
  }
  return {
    filesScanned: new Set(files).size,
    secretCount: secrets.size,
    matches,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: node scripts/check-client-secrets.mjs [--env-file PATH] [CLIENT_ARTIFACT_PATH ...]\nDefaults to apps/web/.next/static and reads configured server-only secrets without printing them. Pass Expo export directories to include mobile bundles.",
    );
    return;
  }
  const paths = [];
  const envFiles = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--env-file") {
      if (!args[index + 1])
        throw new Error("An environment file path is required.");
      envFiles.push(resolve(args[++index]));
    } else if (args[index].startsWith("--"))
      throw new Error("Unknown option. Use --help.");
    else paths.push(resolve(args[index]));
  }
  const secrets = await configuredServerSecrets({
    ...(envFiles.length ? { envFiles } : {}),
  });
  if (!secrets.size)
    throw new Error(
      "No server-only secrets are configured for comparison. Load deployment environment values before scanning.",
    );
  const result = await scanClientArtifacts(
    paths.length ? paths : [resolve(projectRoot, "apps/web/.next/static")],
    secrets,
  );
  if (result.matches.length) {
    console.error(
      `FAIL: server-only values found in ${result.matches.length} client artifact(s). Values are redacted.`,
    );
    for (const match of result.matches)
      console.error(
        `${relative(projectRoot, match.file)}: ${match.variables.join(", ")}`,
      );
    process.exitCode = 1;
  } else
    console.log(
      `PASS: ${result.filesScanned} client artifacts checked against ${result.secretCount} configured server-only values; no literal secret values found.`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    // File paths and upstream errors can themselves contain credentials. Do not echo error objects.
    console.error(
      "Client secret scan could not complete. Check artifact paths, environment files, and build/export output. No secret values were printed.",
    );
    process.exitCode = 2;
  });
}
