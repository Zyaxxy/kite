import type { BasketBundleExecution } from "@kite/sdk";

export interface PendingMainnetExecution {
  version?: 2;
  walletAddress: string;
  requestId: string;
  signature?: string;
  signatures?: string[];
  bundleId?: string;
  statusAuthorization?: string;
  bundle?: {
    signedTransactions: string[];
    authorization: string;
    recoveryExpiresAt: number;
  };
}
const text = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= limit;
const isSignature = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value);
const isTransaction = (value: unknown): value is string =>
  text(value, 5464) &&
  value.length % 4 === 0 &&
  /^[A-Za-z0-9+/]+={0,2}$/.test(value) &&
  (value.length / 4) * 3 -
    (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0) <=
    4096;

/** Read existing single-transaction records as well as versioned bundle records; corruption blocks new submits. */
export function parsePendingMainnetExecution(
  raw: string | null,
): PendingMainnetExecution | null {
  if (raw === null) return null;
  if (raw.length > 40_000)
    throw new Error(
      "The saved transaction receipt is invalid. Check wallet activity before continuing.",
    );
  const value = JSON.parse(raw) as PendingMainnetExecution;
  if (
    !value ||
    !text(value.walletAddress, 44) ||
    !text(value.requestId, 256) ||
    (value.signature !== undefined && !isSignature(value.signature)) ||
    (value.signatures !== undefined &&
      (!Array.isArray(value.signatures) ||
        value.signatures.length > 5 ||
        value.signatures.some((signature) => !isSignature(signature)))) ||
    (value.bundleId !== undefined && !/^[a-f0-9]{64}$/i.test(value.bundleId)) ||
    (value.statusAuthorization !== undefined &&
      !text(value.statusAuthorization, 5000))
  )
    throw new Error(
      "The saved transaction receipt is invalid. Check wallet activity before continuing.",
    );
  if (
    value.bundle &&
    (!Array.isArray(value.bundle.signedTransactions) ||
      value.bundle.signedTransactions.length < 2 ||
      value.bundle.signedTransactions.length > 5 ||
      !value.bundle.signedTransactions.every(isTransaction) ||
      !text(value.bundle.authorization, 5000) ||
      !Number.isSafeInteger(value.bundle.recoveryExpiresAt))
  )
    throw new Error(
      "The saved bundle recovery information is invalid. Check every receipt before continuing.",
    );
  return value;
}

/** Missing fields after a failed poll cannot erase the only recovery material. */
export function mergeBundleReceipt(
  saved: PendingMainnetExecution,
  result: BasketBundleExecution,
): PendingMainnetExecution {
  if (
    result.signatures.length &&
    saved.signatures &&
    (result.signatures.length !== saved.signatures.length ||
      result.signatures.some(
        (signature, index) => signature !== saved.signatures![index],
      ))
  )
    throw new Error(
      "The receipt does not match this basket. Check every original transaction before continuing.",
    );
  return {
    ...saved,
    bundleId: result.bundleId ?? saved.bundleId,
    statusAuthorization:
      result.statusAuthorization ?? saved.statusAuthorization,
    signatures: result.signatures.length ? result.signatures : saved.signatures,
  };
}
