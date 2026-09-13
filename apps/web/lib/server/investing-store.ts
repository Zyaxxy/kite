import { mkdir, open, readdir, rename, unlink, lstat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  RecurringInvestmentPlan,
  RecurringInvestmentReceipt,
  WalletTransactionOrder,
} from "@kite/sdk";

export interface InvestmentRecord {
  plan: RecurringInvestmentPlan;
  receipts: RecurringInvestmentReceipt[];
  prepared?: { runId: string; order: WalletTransactionOrder };
  pending?: {
    runId: string;
    signature: string;
    signedTransaction: string;
    lastValidBlockHeight: number;
  };
}
const validId = /^[a-f0-9]{32}$/;
export function investingStateDirectory() {
  const directory = process.env.KITE_INVESTING_STATE_DIR;
  if (!directory || !path.isAbsolute(directory) || process.env.VERCEL === "1")
    throw new Error(
      "Recurring investing requires a configured persistent server volume; ephemeral serverless storage is not supported.",
    );
  return directory;
}
async function directory() {
  const dir = investingStateDirectory();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw new Error(
      "The investing state directory must be a private directory with mode 0700.",
    );
  return dir;
}
function checkId(id: string) {
  if (!validId.test(id)) throw new Error("Invalid investment plan identifier.");
}
export async function readInvestment(id: string): Promise<InvestmentRecord> {
  checkId(id);
  const file = path.join(await directory(), `${id}.json`);
  const handle = await open(file, "r");
  try {
    if ((await handle.stat()).size > 2_000_000)
      throw new Error("Investment ledger exceeds its supported size.");
    const value = JSON.parse(await handle.readFile("utf8")) as InvestmentRecord;
    if (value.plan.id !== id || !Array.isArray(value.receipts))
      throw new Error("Invalid investment ledger.");
    return value;
  } finally {
    await handle.close();
  }
}
export async function writeInvestment(value: InvestmentRecord) {
  checkId(value.plan.id);
  const dir = await directory();
  const temporary = path.join(dir, `${value.plan.id}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path.join(dir, `${value.plan.id}.json`));
  const parent = await open(dir, "r");
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}
export async function investmentIds() {
  return (await readdir(await directory()))
    .filter((name) => /^[a-f0-9]{32}\.json$/.test(name))
    .map((name) => name.slice(0, -5));
}
/** A filesystem lease is deliberately not stolen after a timeout: an unknown submission must be reconciled. */
export async function withInvestmentLock<T>(
  id: string,
  action: () => Promise<T>,
): Promise<T> {
  checkId(id);
  const file = path.join(await directory(), `${id}.lock`);
  let handle;
  try {
    handle = await open(file, "wx", 0o600);
  } catch {
    throw new Error(
      "This investment is already being processed. Retry shortly; stale locks require operator reconciliation.",
    );
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, at: Date.now() }),
    );
    return await action();
  } finally {
    await handle.close();
    await unlink(file);
  }
}
export async function createInvestment(value: InvestmentRecord) {
  return withInvestmentLock("00000000000000000000000000000000", async () => {
    const ids = await investmentIds();
    if (ids.includes(value.plan.id)) {
      const existing = await readInvestment(value.plan.id);
      // Replaying an owner's exact setup must never erase pending executions or receipts.
      const immutable = (p: RecurringInvestmentPlan) => ({
        ...p,
        status: "draft",
      });
      if (
        JSON.stringify(immutable(existing.plan)) !==
        JSON.stringify(immutable(value.plan))
      )
        throw new Error("An investment with different terms already exists.");
      return;
    }
    if (ids.length >= 2000)
      throw new Error(
        "The investment service has reached its configured plan capacity.",
      );
    let ownerCount = 0;
    for (const id of ids) {
      const existing = await readInvestment(id);
      // A draft may already be approved onchain while the service was offline.
      // Keep it until an operator proves the permission absent/expired; never age-delete it.
      if (existing.plan.owner === value.plan.owner) ownerCount++;
    }
    if (ownerCount >= 50)
      throw new Error("This wallet has reached the service's plan limit.");
    await writeInvestment(value);
  });
}
