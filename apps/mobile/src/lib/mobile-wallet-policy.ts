export type WalletNetwork = "mainnet" | "devnet";

export interface NativeSigningReview {
  signer: string;
  network: WalletNetwork;
  transactionVersion: 0 | 1;
  transactions: string[];
  expiresAt: number;
}

export function walletAuthorizationKey(network: WalletNetwork) {
  return `kite.${network}.wallet.authorization.v1`;
}

/** Rechecked immediately before and after the native wallet prompt. */
export function assertNativeSigningReview(
  review: NativeSigningReview,
  account: { address: string; supportedTransactionVersions?: number[] },
  network: WalletNetwork,
  now = Date.now(),
) {
  if (review.network !== network)
    throw new Error(
      "The wallet network does not match this review. Request a fresh review.",
    );
  if (
    review.signer !== account.address ||
    !Number.isSafeInteger(review.expiresAt) ||
    review.expiresAt <= now
  )
    throw new Error(
      "The wallet changed or this review expired. Request a fresh review.",
    );
  if (
    !account.supportedTransactionVersions?.includes(review.transactionVersion)
  )
    throw new Error(
      `Reconnect a wallet that advertises V${review.transactionVersion} transaction signing.`,
    );
  if (
    review.transactions.length < 1 ||
    review.transactions.length > 5 ||
    review.transactions.some(
      (transaction) =>
        !transaction ||
        transaction.length > 8192 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(transaction),
    )
  )
    throw new Error(
      "The reviewed transaction payload is invalid. Nothing was submitted.",
    );
  if (
    review.transactions.length > 1 &&
    (network !== "mainnet" || review.transactionVersion !== 0)
  )
    throw new Error(
      "Only reviewed mainnet V0 basket bundles support batch signing.",
    );
}

export function assertSignedPayloads(payloads: string[], expected: number) {
  if (
    payloads.length !== expected ||
    payloads.some(
      (payload) =>
        !payload ||
        payload.length > 8192 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(payload),
    )
  )
    throw new Error(
      "The wallet did not return every signed transaction. Nothing was submitted.",
    );
}
