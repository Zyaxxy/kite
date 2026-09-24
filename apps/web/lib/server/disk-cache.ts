import { promises as fs } from "node:fs";
import path from "node:path";
import type { MarketSnapshot } from "@kite/sdk";

export function isDiskCacheConfigured(): boolean {
  return process.env.NODE_ENV !== "test";
}

let cachedDir: string | null = null;

async function getCacheDir(): Promise<string | null> {
  if (cachedDir) return cachedDir;

  const candidateDirs = [
    process.env.KITE_CACHE_DIR,
    path.join(process.cwd(), ".kite-cache"),
    path.join("/tmp", ".kite-cache"),
  ].filter((d): d is string => Boolean(d?.trim()));

  for (const dir of candidateDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      // Test writability
      const testFile = path.join(dir, `.test-${Date.now()}`);
      await fs.writeFile(testFile, "ok", "utf8");
      await fs.unlink(testFile);
      cachedDir = dir;
      return dir;
    } catch {
      // Try next directory
    }
  }

  return null;
}

export async function getDiskMarketSnapshot(): Promise<MarketSnapshot | null> {
  try {
    const dir = await getCacheDir();
    if (!dir) return null;
    const file = path.join(dir, "snapshot.json");
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.network === "mainnet-beta" &&
      Array.isArray(parsed.assets) &&
      parsed.assets.length > 0 &&
      parsed.status !== "unavailable"
    ) {
      return parsed as MarketSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setDiskMarketSnapshot(snapshot: MarketSnapshot): Promise<void> {
  if (!snapshot || snapshot.status === "unavailable" || !snapshot.assets.length) return;
  try {
    const dir = await getCacheDir();
    if (!dir) return;
    const file = path.join(dir, "snapshot.json");
    const tempFile = `${file}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, JSON.stringify(snapshot), "utf8");
    await fs.rename(tempFile, file);
  } catch {
    // Non-blocking fallback
  }
}

export async function getDiskCatalog(): Promise<MarketSnapshot | null> {
  try {
    const dir = await getCacheDir();
    if (!dir) return null;
    const file = path.join(dir, "catalog.json");
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.network === "mainnet-beta" &&
      Array.isArray(parsed.assets) &&
      parsed.assets.length > 0
    ) {
      return parsed as MarketSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setDiskCatalog(catalog: MarketSnapshot): Promise<void> {
  if (!catalog || !catalog.assets.length) return;
  try {
    const dir = await getCacheDir();
    if (!dir) return;
    const file = path.join(dir, "catalog.json");
    const tempFile = `${file}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, JSON.stringify(catalog), "utf8");
    await fs.rename(tempFile, file);
  } catch {
    // Non-blocking fallback
  }
}
