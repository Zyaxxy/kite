/** Refresh the reviewed issuer logo sources, without touching market data. */
import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nextRequire = createRequire(
  await realpath(
    new URL("../apps/web/node_modules/next/package.json", import.meta.url),
  ),
);
const sharp = nextRequire("sharp");
const directory = new URL("../apps/web/public/company-logos/", import.meta.url);
const manifestUrl = new URL("manifest.json", directory);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
const approvedHosts = new Set(["xstocks-metadata.backed.fi", "prestocks.com"]);
const queue = [...manifest.logos];

async function download() {
  for (let entry = queue.shift(); entry; entry = queue.shift()) {
    const source = new URL(entry.source);
    if (
      source.protocol !== "https:" ||
      !approvedHosts.has(source.hostname) ||
      !/^[a-z0-9-]+\.webp$/.test(entry.file)
    ) {
      throw new Error(`Unapproved logo source or filename: ${entry.symbol}`);
    }
    const response = await fetch(source, {
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`${entry.symbol}: HTTP ${response.status}`);
    const input = Buffer.from(await response.arrayBuffer());
    if (input.length > 5_000_000)
      throw new Error(`${entry.symbol}: oversized logo`);
    const output = await sharp(input, { limitInputPixels: 16_000_000 })
      .resize(96, 96, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .webp({ quality: 82, effort: 6 })
      .toBuffer();
    await writeFile(new URL(entry.file, directory), output);
    entry.originalBytes = input.length;
    entry.bytes = output.length;
    entry.sha256 = createHash("sha256").update(output).digest("hex");
  }
}

await Promise.all(Array.from({ length: 4 }, download));
manifest.retrievedAt = new Date().toISOString();
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
const total = manifest.logos.reduce((sum, entry) => sum + entry.bytes, 0);
console.log(
  `Saved ${manifest.logos.length} issuer logos (${total.toLocaleString()} bytes) to ${fileURLToPath(directory)}`,
);
