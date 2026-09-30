import {
  createHash,
  createHmac,
  createPublicKey,
  randomUUID,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  BASKET_MAX_TRANSACTIONS,
  MAX_BASKET_TRANSACTION_BASE64_LENGTH,
} from "@kite/sdk";
import { inspectMainnetWalletTransaction } from "./composed-transactions";

export interface BasketReceipt {
  basketId: string;
  inputMint: string;
  inAmount: string;
}
export interface BundleAuthorization extends BasketReceipt {
  kind: "kite-bundle" | "kite-bundle-v0";
  /** Absent only on quotes prepared before version-aware bundle authorization. */
  transactionVersion?: 0 | 1;
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
async function transaction(encoded: string, taker: string) {
  if (
    typeof encoded !== "string" ||
    encoded.length > MAX_BASKET_TRANSACTION_BASE64_LENGTH ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw new Error("Invalid bundle transaction.");
  const { transaction: tx, message } =
    await inspectMainnetWalletTransaction(encoded);
  const signers = Object.keys(tx.signatures);
  if (
    signers.length !== 1 ||
    signers[0] !== taker ||
    message.staticAccounts[0] !== taker
  )
    throw new Error(
      "The reviewed wallet must be the only bundle signer and fee payer.",
    );
  return { tx, version: message.version as 0 | 1 };
}
const hash = (tx: Awaited<ReturnType<typeof transaction>>["tx"]) =>
  createHash("sha256").update(Buffer.from(tx.messageBytes)).digest("hex");

export async function authorizeBundle(
  input: BasketReceipt & {
    transactions: string[];
    taker: string;
    expiresAt: number;
    lastValidBlockHeight: number;
  },
): Promise<{ requestId: string; authorization: string }> {
  if (
    input.transactions.length < 2 ||
    input.transactions.length > BASKET_MAX_TRANSACTIONS
  )
    throw new Error(
      "Baskets require two to five complete bundle transactions.",
    );
  const inspected = await Promise.all(
    input.transactions.map((encoded) => transaction(encoded, input.taker)),
  );
  const transactionVersion = inspected[0].version;
  if (inspected.some((item) => item.version !== transactionVersion))
    throw new Error("Bundle transactions must use the same reviewed version.");
  const messageHashes = inspected.map(({ tx }) => hash(tx));
  if (new Set(messageHashes).size !== messageHashes.length)
    throw new Error("Duplicate bundle transaction.");
  const requestId = randomUUID();
  return {
    requestId,
    authorization: encode({
      kind: "kite-bundle",
      transactionVersion,
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
export async function verifyBundle(
  authorization: string,
  signedTransactions: string[],
  recovery?: { readOnly: true },
): Promise<BundleAuthorization & { transactionVersion: 0 | 1 }> {
  const payload = decode(authorization, Boolean(recovery));
  if (
    (payload.kind !== "kite-bundle-v0" && payload.kind !== "kite-bundle") ||
    !Array.isArray(payload.messageHashes) ||
    !Array.isArray(signedTransactions) ||
    signedTransactions.length !== payload.messageHashes.length ||
    signedTransactions.length < 2 ||
    signedTransactions.length > BASKET_MAX_TRANSACTIONS
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
  const transactionVersion =
    payload.kind === "kite-bundle-v0" ? 0 : payload.transactionVersion;
  if (transactionVersion !== 0 && transactionVersion !== 1)
    throw new Error("Invalid bundle transaction version.");
  await Promise.all(
    signedTransactions.map(async (encoded, i) => {
      const { tx, version } = await transaction(encoded, payload.taker);
      if (version !== transactionVersion)
        throw new Error(
          "The signed bundle uses a different transaction version.",
        );
      if (hash(tx) !== payload.messageHashes[i])
        throw new Error(
          "The signed bundle differs from the reviewed allocation.",
        );
      const signature =
        tx.signatures[payload.taker as keyof typeof tx.signatures];
      if (
        !signature ||
        !verify(null, Buffer.from(tx.messageBytes), key, Buffer.from(signature))
      )
        throw new Error(
          "A valid wallet signature is required for every bundle transaction.",
        );
    }),
  );
  return { ...payload, transactionVersion };
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
