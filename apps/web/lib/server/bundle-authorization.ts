import {
  createHash,
  createHmac,
  createPublicKey,
  randomUUID,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";

export interface BasketReceipt {
  basketId: string;
  inputMint: string;
  inAmount: string;
}
export interface BundleAuthorization extends BasketReceipt {
  kind: "kite-bundle-v0";
  requestId: string;
  taker: string;
  expiresAt: number;
  lastValidBlockHeight: number;
  messageHashes: string[];
}
export interface BundleStatusAuthorization extends BasketReceipt {
  kind: "kite-bundle-status";
  taker: string;
  expiresAt: number;
  lastValidBlockHeight: number;
  signatures: string[];
  bundleId?: string;
}
function secret() {
  const value = process.env.KITE_TRADE_SECRET;
  if (!value || value.length < 32)
    throw new Error("Server transaction authorization is not configured.");
  return value;
}
function encode(
  payload: BundleAuthorization | BundleStatusAuthorization,
): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return (
    encoded +
    "." +
    createHmac("sha256", secret()).update(encoded).digest("base64url")
  );
}
function decode(
  value: string,
  recovery = false,
): BundleAuthorization | BundleStatusAuthorization {
  if (typeof value !== "string" || value.length > 5000)
    throw new Error("Invalid bundle authorization.");
  const [encoded, mac, ...extra] = value.split(".");
  if (!encoded || !mac || extra.length)
    throw new Error("Invalid bundle authorization.");
  const expected = createHmac("sha256", secret()).update(encoded).digest();
  const received = Buffer.from(mac, "base64url");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    throw new Error("Invalid bundle authorization.");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as
    BundleAuthorization | BundleStatusAuthorization;
  if (
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt + (recovery ? 24 * 60 * 60 * 1000 : 0) <= Date.now() ||
    !Number.isSafeInteger(payload.lastValidBlockHeight) ||
    payload.lastValidBlockHeight < 1
  )
    throw new Error(
      "This bundle authorization expired. Check prior receipts before requesting a new quote.",
    );
  return payload;
}
function transaction(encoded: string, taker: string) {
  if (
    typeof encoded !== "string" ||
    encoded.length > 1644 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw new Error("Invalid v0 bundle transaction.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > 1232)
    throw new Error("Bundle transaction exceeds 1232 bytes.");
  const tx = VersionedTransaction.deserialize(bytes);
  if (
    tx.message.version !== 0 ||
    tx.message.header.numRequiredSignatures !== 1 ||
    tx.message.staticAccountKeys[0].toBase58() !== taker
  )
    throw new Error(
      "The reviewed wallet must be the only bundle signer and fee payer.",
    );
  const accountCount =
    tx.message.staticAccountKeys.length +
    tx.message.addressTableLookups.reduce(
      (n, table) =>
        n + table.readonlyIndexes.length + table.writableIndexes.length,
      0,
    );
  if (accountCount > 64)
    throw new Error("Bundle transaction exceeds 64 accounts.");
  return tx;
}
const hash = (tx: VersionedTransaction) =>
  createHash("sha256").update(tx.message.serialize()).digest("hex");

export function authorizeBundle(
  input: BasketReceipt & {
    transactions: string[];
    taker: string;
    expiresAt: number;
    lastValidBlockHeight: number;
  },
): { requestId: string; authorization: string } {
  if (input.transactions.length < 2 || input.transactions.length > 3)
    throw new Error(
      "Baskets require two or three complete bundle transactions.",
    );
  const messageHashes = input.transactions.map((encoded) =>
    hash(transaction(encoded, input.taker)),
  );
  if (new Set(messageHashes).size !== messageHashes.length)
    throw new Error("Duplicate bundle transaction.");
  const requestId = randomUUID();
  return {
    requestId,
    authorization: encode({
      kind: "kite-bundle-v0",
      requestId,
      taker: input.taker,
      expiresAt: input.expiresAt,
      lastValidBlockHeight: input.lastValidBlockHeight,
      messageHashes,
      basketId: input.basketId,
      inputMint: input.inputMint,
      inAmount: input.inAmount,
    }),
  };
}

/** A bundle authorization cannot be presented to the single-transaction execution route. */
export function verifyBundle(
  authorization: string,
  signedTransactions: string[],
  recovery?: { readOnly: true },
): BundleAuthorization {
  const payload = decode(authorization, Boolean(recovery));
  if (
    payload.kind !== "kite-bundle-v0" ||
    !Array.isArray(signedTransactions) ||
    signedTransactions.length !== payload.messageHashes.length ||
    signedTransactions.length < 2 ||
    signedTransactions.length > 3
  )
    throw new Error(
      "Every reviewed bundle transaction must be signed in its original order.",
    );
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      new PublicKey(payload.taker).toBuffer(),
    ]),
    format: "der",
    type: "spki",
  });
  signedTransactions.forEach((encoded, i) => {
    const tx = transaction(encoded, payload.taker);
    if (hash(tx) !== payload.messageHashes[i])
      throw new Error(
        "The signed bundle differs from the reviewed allocation.",
      );
    if (!verify(null, tx.message.serialize(), key, tx.signatures[0]))
      throw new Error(
        "A valid wallet signature is required for every bundle transaction.",
      );
  });
  return payload;
}
export function authorizeBundleStatus(
  input: Omit<BundleStatusAuthorization, "kind" | "expiresAt">,
): string {
  return encode({
    ...input,
    kind: "kite-bundle-status",
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
}
export function verifyBundleStatus(
  value: string,
  bundleId?: string,
): BundleStatusAuthorization {
  const payload = decode(value);
  if (payload.kind !== "kite-bundle-status" || payload.bundleId !== bundleId)
    throw new Error("Invalid bundle receipt authorization.");
  return payload;
}
