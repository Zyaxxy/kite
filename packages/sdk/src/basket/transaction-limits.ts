/** Shared transport bounds; this module has no Solana or Node runtime imports. */
export const V0_MAX_BYTES = 1232;
export const V1_MAX_BYTES = 4096;
export const BASKET_MAX_ACCOUNTS = 64;
export const BASKET_MAX_TRANSACTIONS = 5;
export const BASKET_MAX_LEGS = 12;
export const MAX_BASKET_TRANSACTION_BASE64_LENGTH = 5464;

/** Only a capacity failure permits another partition or execution route. */
export class TransactionCapacityError extends Error {
  constructor(
    message: string,
    readonly limit: "accounts" | "bytes" | "bundle",
  ) {
    super(message);
    this.name = "TransactionCapacityError";
  }
}

export function isTransactionCapacityError(
  error: unknown,
): error is TransactionCapacityError {
  return error instanceof TransactionCapacityError;
}
