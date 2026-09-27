import {
  assertDevnetRecurringReview,
  type DevnetRecurringReview,
} from "@kite/sdk";
export type NativeRecurringReview = DevnetRecurringReview;
export interface NativePendingRecurring {
  order: NativeRecurringReview;
  signedTransaction: string;
}

export function parsePendingRecurring(
  raw: string,
  owner: string,
): NativePendingRecurring {
  const record = JSON.parse(raw) as NativePendingRecurring;
  assertDevnetRecurringReview(record.order, owner);
  if (
    typeof record.signedTransaction !== "string" ||
    record.signedTransaction.length > 8192 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(record.signedTransaction)
  )
    throw new Error(
      "The saved devnet submission is unreadable. Check wallet activity before replacing device data.",
    );
  return record;
}
