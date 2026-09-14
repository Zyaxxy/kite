import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  DEVNET_GENESIS_HASH,
  inspectWalletTransaction,
  walletTransactionSignature,
} from "@kite/sdk";
import type { RpcAccount } from "./composed-transactions";

const TX_V1_FEATURE = "txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL";
const FEATURE_PROGRAM = "Feature111111111111111111111111111111111111";
export const RECURRING_PROTOCOL_VERSION = 2;

/** Recurring never inherits the mainnet trading RPC or the browser wallet connection. */
export async function recurringDevnetRpc<T>(
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const endpoint =
    process.env.KITE_RECURRING_RPC_URL || "https://api.devnet.solana.com";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json();
    if (!response.ok || data.error || !("result" in data)) throw new Error();
    return data.result as T;
  } catch {
    throw new Error("The recurring devnet RPC is unavailable.");
  }
}

export async function assertRecurringDevnet(): Promise<void> {
  if (
    (await recurringDevnetRpc<string>("getGenesisHash")) !== DEVNET_GENESIS_HASH
  ) {
    throw new Error(
      "Recurring investing is restricted to Solana devnet. The configured RPC belongs to another cluster.",
    );
  }
}

export async function recurringV1Active(): Promise<boolean> {
  const [{ value }, slot] = await Promise.all([
    recurringDevnetRpc<{ value: RpcAccount }>("getAccountInfo", [
      TX_V1_FEATURE,
      { encoding: "base64", commitment: "confirmed" },
    ]),
    recurringDevnetRpc<number>("getSlot", [{ commitment: "confirmed" }]),
  ]);
  if (!value || value.owner !== FEATURE_PROGRAM || value.data[1] !== "base64")
    return false;
  const bytes = Buffer.from(value.data[0], "base64");
  return (
    bytes.length === 9 &&
    bytes[0] === 1 &&
    bytes.readBigUInt64LE(1) <= BigInt(slot)
  );
}

export async function assertRecurringV1(
  versions?: readonly number[],
): Promise<void> {
  if (!versions?.includes(1))
    throw new Error(
      "Connect a wallet that advertises V1 signing to create an atomic devnet recurring plan.",
    );
  await assertRecurringDevnet();
  if (!(await recurringV1Active()))
    throw new Error(
      "Atomic recurring transactions require V1 activation on the configured devnet RPC.",
    );
}

export async function recurringLatestBlockhash() {
  return (
    await recurringDevnetRpc<{
      value: { blockhash: string; lastValidBlockHeight: number };
    }>("getLatestBlockhash", [{ commitment: "confirmed" }])
  ).value;
}

export async function simulateRecurring(
  transaction: string,
  expectedReturn?: { programId: string; value: number },
) {
  const { value } = await recurringDevnetRpc<{
    value: {
      err: unknown;
      unitsConsumed?: number;
      returnData?: { programId: string; data: [string, string] };
    };
  }>("simulateTransaction", [
    transaction,
    {
      encoding: "base64",
      commitment: "confirmed",
      sigVerify: false,
      replaceRecentBlockhash: false,
    },
  ]);
  if (value.err !== null)
    throw new Error(
      "The devnet transaction failed simulation. Check test-token balances, pool liquidity, account rent, and the deployed recurring contract version.",
    );
  if (expectedReturn) {
    const returned = value.returnData;
    const data =
      returned?.data[1] === "base64"
        ? Buffer.from(returned.data[0], "base64")
        : null;
    if (
      returned?.programId !== expectedReturn.programId ||
      data?.length !== 1 ||
      data[0] !== expectedReturn.value
    ) {
      throw new Error(
        "The deployed recurring contract does not implement protocol v2. Upgrade the devnet contract before creating or collecting a plan.",
      );
    }
  }
  return value;
}

function recurringSecret() {
  const value = process.env.KITE_RECURRING_AUTH_SECRET;
  if (!value || value.length < 32)
    throw new Error(
      "Devnet recurring transaction authorization is not configured.",
    );
  return value;
}

export function recurringAuthorizationConfigured(): boolean {
  return Boolean(
    process.env.KITE_RECURRING_AUTH_SECRET &&
    process.env.KITE_RECURRING_AUTH_SECRET.length >= 32,
  );
}

export interface DevnetPreparedTransaction {
  schemaVersion: 1;
  network: "devnet";
  protocolVersion: 2;
  transaction: string;
  transactionVersion: 1;
  authorization: string;
  signer: string;
  plan: string;
  operation: "create" | "collect" | "close";
  expiresAt: number;
  lastValidBlockHeight: number;
}

/** This HMAC key only authorizes exact messages; it cannot sign or spend any asset. */
export async function authorizeRecurringTransaction(
  input: Omit<
    DevnetPreparedTransaction,
    | "schemaVersion"
    | "network"
    | "protocolVersion"
    | "authorization"
    | "transactionVersion"
  >,
): Promise<DevnetPreparedTransaction> {
  const { transaction, message } = await inspectWalletTransaction(
    input.transaction,
  );
  if (
    message.version !== 1 ||
    message.staticAccounts[0] !== input.signer ||
    Object.keys(transaction.signatures).length !== 1 ||
    !Object.hasOwn(transaction.signatures, input.signer)
  ) {
    throw new Error(
      "The recurring transaction must have exactly one reviewed fee-payer signer.",
    );
  }
  const payload = {
    kind: "kite-recurring-devnet-v2",
    genesis: DEVNET_GENESIS_HASH,
    signer: input.signer,
    plan: input.plan,
    operation: input.operation,
    expiresAt: input.expiresAt,
    lastValidBlockHeight: input.lastValidBlockHeight,
    messageHash: createHash("sha256")
      .update(Buffer.from(transaction.messageBytes))
      .digest("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    ...input,
    schemaVersion: 1,
    network: "devnet",
    protocolVersion: 2,
    transactionVersion: 1,
    authorization: `${encoded}.${createHmac("sha256", recurringSecret()).update(encoded).digest("base64url")}`,
  };
}

export async function verifyRecurringTransaction(
  authorization: string,
  signed: string,
  recovery?: { acceptExpiredForStatus: true },
) {
  const [encoded, mac, ...extra] = authorization.split(".");
  if (!encoded || !mac || extra.length)
    throw new Error("Invalid devnet transaction authorization.");
  const expected = createHmac("sha256", recurringSecret())
    .update(encoded)
    .digest();
  const received = Buffer.from(mac, "base64url");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    throw new Error("Invalid devnet transaction authorization.");
  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString(),
  ) as Record<string, unknown>;
  if (
    payload.kind !== "kite-recurring-devnet-v2" ||
    payload.genesis !== DEVNET_GENESIS_HASH ||
    typeof payload.signer !== "string" ||
    typeof payload.plan !== "string" ||
    !Number.isSafeInteger(payload.expiresAt) ||
    (Number(payload.expiresAt) <= Date.now() &&
      !recovery?.acceptExpiredForStatus) ||
    !Number.isSafeInteger(payload.lastValidBlockHeight)
  ) {
    throw new Error(
      "This devnet transaction authorization has expired or is invalid.",
    );
  }
  const { transaction, message } = await inspectWalletTransaction(signed);
  if (
    message.version !== 1 ||
    message.staticAccounts[0] !== payload.signer ||
    Object.keys(transaction.signatures).length !== 1 ||
    createHash("sha256")
      .update(Buffer.from(transaction.messageBytes))
      .digest("hex") !== payload.messageHash
  ) {
    throw new Error(
      "The signed recurring transaction differs from the reviewed devnet transaction.",
    );
  }
  const signature =
    transaction.signatures[
      payload.signer as keyof typeof transaction.signatures
    ];
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      new PublicKey(payload.signer).toBuffer(),
    ]),
    format: "der",
    type: "spki",
  });
  if (
    !signature ||
    !verify(
      null,
      Buffer.from(transaction.messageBytes),
      key,
      Buffer.from(signature),
    )
  )
    throw new Error("A valid wallet signature is required.");
  return {
    signer: payload.signer,
    plan: payload.plan,
    operation: payload.operation,
    expiresAt: Number(payload.expiresAt),
    lastValidBlockHeight: Number(payload.lastValidBlockHeight),
  };
}

export async function executeRecurringTransaction(input: {
  authorization: string;
  signedTransaction: string;
}) {
  const authorization = await verifyRecurringTransaction(
    input.authorization,
    input.signedTransaction,
    { acceptExpiredForStatus: true },
  );
  await assertRecurringDevnet();
  if (!(await recurringV1Active()))
    throw new Error("V1 is not active on this devnet RPC.");
  const signature = await walletTransactionSignature(input.signedTransaction);
  const reply = (
    status: "failed" | "confirmed" | "submitted" | "unknown" | "expired",
  ) => ({
    schemaVersion: 1,
    network: "devnet",
    plan: authorization.plan,
    signature,
    status,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  });
  const readStatus = async () =>
    (
      await recurringDevnetRpc<{
        value: Array<{ err: unknown; confirmationStatus?: string } | null>;
      }>("getSignatureStatuses", [
        [signature],
        { searchTransactionHistory: true },
      ])
    ).value[0];
  // Recovery always queries the same signature; it never creates a replacement plan or transaction.
  try {
    const prior = await readStatus();
    if (prior?.err) return reply("failed");
    if (prior)
      return reply(
        ["confirmed", "finalized"].includes(prior.confirmationStatus ?? "")
          ? "confirmed"
          : "submitted",
      );
  } catch {
    return reply("unknown");
  }
  if (
    (await recurringDevnetRpc<number>("getBlockHeight", [
      { commitment: "confirmed" },
    ])) > authorization.lastValidBlockHeight
  ) {
    // Recheck after observing expiry so a last-block landing cannot be mistaken for non-execution.
    try {
      const final = await readStatus();
      if (final?.err) return reply("failed");
      if (final)
        return reply(
          ["confirmed", "finalized"].includes(final.confirmationStatus ?? "")
            ? "confirmed"
            : "submitted",
        );
      return reply("expired");
    } catch {
      return reply("unknown");
    }
  }
  if (authorization.expiresAt <= Date.now()) return reply("unknown");
  await simulateRecurring(input.signedTransaction);
  let status: { err: unknown; confirmationStatus?: string } | null = null;
  let uncertain = false;
  try {
    const sent = await recurringDevnetRpc<string>("sendTransaction", [
      input.signedTransaction,
      {
        encoding: "base64",
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 2,
      },
    ]);
    if (sent !== signature)
      throw new Error(
        "The devnet RPC returned an unexpected transaction signature.",
      );
    status = await readStatus();
  } catch {
    // A timeout after submission is not proof of failure. Return the pre-derived explorer ID.
    uncertain = true;
  }
  return reply(
    uncertain
      ? "unknown"
      : status?.err
        ? "failed"
        : ["confirmed", "finalized"].includes(status?.confirmationStatus ?? "")
          ? "confirmed"
          : "submitted",
  );
}
