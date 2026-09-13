import { mkdir, lstat, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { investingStateDirectory } from "./investing-store";

export const EXECUTOR_HEARTBEAT_TTL_SECONDS = 180;
interface ExecutorHeartbeat {
  buyer: string;
  /** Unix seconds, recorded by the API server after an authenticated worker request. */
  lastSeenAt: number;
}
export interface ExecutorHealth {
  healthy: boolean;
  lastSeenAt: number | null;
}

/** A heartbeat establishes recent reachability, never a guarantee of future execution. */
export function executorHeartbeatHealth(
  value: unknown,
  buyer: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ExecutorHealth {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { healthy: false, lastSeenAt: null };
  const heartbeat = value as Partial<ExecutorHeartbeat>;
  if (
    heartbeat.buyer !== buyer ||
    !Number.isSafeInteger(heartbeat.lastSeenAt) ||
    heartbeat.lastSeenAt! < 0 ||
    heartbeat.lastSeenAt! > nowSeconds
  )
    return { healthy: false, lastSeenAt: null };
  return {
    healthy:
      nowSeconds - heartbeat.lastSeenAt! < EXECUTOR_HEARTBEAT_TTL_SECONDS,
    lastSeenAt: heartbeat.lastSeenAt!,
  };
}

async function healthDirectory() {
  const directory = investingStateDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o077) !== 0
  )
    throw new Error(
      "The investment worker heartbeat requires private persistent storage.",
    );
  return directory;
}

/** Call only for authenticated executor traffic, never from a public config request. */
export async function recordExecutorHeartbeat(buyer: string): Promise<void> {
  const directory = await healthDirectory();
  const temporary = path.join(
    directory,
    `executor-heartbeat.${randomUUID()}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(
      JSON.stringify({
        buyer,
        lastSeenAt: Math.floor(Date.now() / 1000),
      } satisfies ExecutorHeartbeat),
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path.join(directory, "executor-heartbeat.json"));
  const parent = await open(directory, "r");
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}

export async function readExecutorHeartbeat(
  buyer: string,
): Promise<ExecutorHealth> {
  try {
    const file = path.join(await healthDirectory(), "executor-heartbeat.json");
    const metadata = await lstat(file);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size > 1024 ||
      (metadata.mode & 0o077) !== 0
    )
      return { healthy: false, lastSeenAt: null };
    return executorHeartbeatHealth(
      JSON.parse(await readFile(file, "utf8")),
      buyer,
    );
  } catch {
    return { healthy: false, lastSeenAt: null };
  }
}
