import { PublicKey } from "@solana/web3.js";

function object(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  ) {
    throw new Error(
      "Invalid recurring v2 request. Legacy buyer/delegation requests are no longer accepted.",
    );
  }
  return value as Record<string, unknown>;
}
function address(value: unknown, signer = false): string {
  if (typeof value !== "string" || value.length > 44)
    throw new Error("A valid Solana address is required.");
  const key = new PublicKey(value);
  if (signer && !PublicKey.isOnCurve(key.toBytes()))
    throw new Error("A signing wallet address is required.");
  return key.toBase58();
}
function version(value: unknown) {
  if (value !== 1)
    throw new Error(
      "Recurring requests must use schemaVersion 1 and the devnet v2 contract.",
    );
}
function signingVersions(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length > 3 ||
    value.some((item) => !Number.isInteger(item) || item < 0 || item > 1) ||
    !value.includes(1)
  )
    throw new Error("This wallet must advertise V1 transaction signing.");
  return value;
}
export interface CreateDevnetPlanRequest {
  schemaVersion: 1;
  owner: string;
  target: { type: "stock" | "basket"; id: string };
  amount: string;
  periodSeconds: number;
  periods: number;
  supportedTransactionVersions: number[];
}
export function parseCreateDevnetPlan(value: unknown): CreateDevnetPlanRequest {
  const input = object(value, [
    "schemaVersion",
    "owner",
    "target",
    "amount",
    "periodSeconds",
    "periods",
    "supportedTransactionVersions",
  ]);
  version(input.schemaVersion);
  const target = object(input.target, ["type", "id"]);
  if (
    (target.type !== "stock" && target.type !== "basket") ||
    typeof target.id !== "string" ||
    !/^[A-Za-z0-9-]{1,40}$/.test(target.id)
  )
    throw new Error("Select a supported devnet stock or basket.");
  if (
    typeof input.amount !== "string" ||
    !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(input.amount) ||
    Number(input.amount) <= 0
  )
    throw new Error(
      "Enter a positive test-token amount with at most six decimal places.",
    );
  if (
    !Number.isSafeInteger(input.periodSeconds) ||
    Number(input.periodSeconds) < 60 ||
    !Number.isSafeInteger(input.periods) ||
    Number(input.periods) < 1 ||
    Number(input.periods) > 365 ||
    Number(input.periodSeconds) * Number(input.periods) > 31_536_000
  )
    throw new Error(
      "Choose 1–365 periods of at least 60 seconds, ending within one year.",
    );
  return {
    schemaVersion: 1,
    owner: address(input.owner, true),
    target: { type: target.type, id: target.id },
    amount: input.amount,
    periodSeconds: Number(input.periodSeconds),
    periods: Number(input.periods),
    supportedTransactionVersions: signingVersions(
      input.supportedTransactionVersions,
    ),
  };
}
export function parseCollectDevnetPlan(value: unknown) {
  const input = object(value, [
    "schemaVersion",
    "plan",
    "feePayer",
    "expectedPeriodIndex",
  ]);
  version(input.schemaVersion);
  if (
    !Number.isSafeInteger(input.expectedPeriodIndex) ||
    Number(input.expectedPeriodIndex) < 0 ||
    Number(input.expectedPeriodIndex) >= 365
  )
    throw new Error("Choose the exact current period index to collect.");
  return {
    schemaVersion: 1 as const,
    plan: address(input.plan),
    feePayer: address(input.feePayer, true),
    expectedPeriodIndex: Number(input.expectedPeriodIndex),
  };
}
export function parseCloseDevnetPlan(value: unknown) {
  const input = object(value, [
    "schemaVersion",
    "plan",
    "owner",
    "supportedTransactionVersions",
  ]);
  version(input.schemaVersion);
  return {
    schemaVersion: 1 as const,
    plan: address(input.plan),
    owner: address(input.owner, true),
    supportedTransactionVersions: signingVersions(
      input.supportedTransactionVersions,
    ),
  };
}
export function parseExecuteDevnetPlan(value: unknown) {
  const input = object(value, [
    "schemaVersion",
    "authorization",
    "signedTransaction",
  ]);
  version(input.schemaVersion);
  if (
    typeof input.authorization !== "string" ||
    input.authorization.length > 4096 ||
    typeof input.signedTransaction !== "string" ||
    input.signedTransaction.length > 8192 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input.signedTransaction)
  )
    throw new Error("A reviewed and signed devnet transaction is required.");
  return {
    authorization: input.authorization,
    signedTransaction: input.signedTransaction,
  };
}
export function parseDevnetWallet(value: unknown): string {
  return address(value, true);
}
