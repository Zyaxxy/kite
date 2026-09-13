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
  inspectWalletTransaction,
  type WalletTransactionOrder,
} from "@kite/sdk";

export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const TX_V1_FEATURE = "txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL";
export type RpcAccount = {
  data: [string, string];
  owner: string;
  executable: boolean;
  lamports: number;
} | null;
export async function mainnetRpc<T>(
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const endpoint =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
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
    throw new Error("The mainnet RPC is unavailable.");
  }
}
export async function assertMainnet() {
  if ((await mainnetRpc<string>("getGenesisHash")) !== MAINNET_GENESIS)
    throw new Error("The server RPC must use Solana mainnet.");
}
export async function mainnetV1Active(): Promise<boolean> {
  try {
    const [{ value }, slot] = await Promise.all([
      mainnetRpc<{ value: RpcAccount }>("getAccountInfo", [
        TX_V1_FEATURE,
        { encoding: "base64", commitment: "confirmed" },
      ]),
      mainnetRpc<number>("getSlot", [{ commitment: "confirmed" }]),
    ]);
    if (!value || value.owner !== "Feature111111111111111111111111111111111111")
      return false;
    const bytes = Buffer.from(value.data[0], "base64");
    return (
      bytes.length === 9 &&
      bytes[0] === 1 &&
      bytes.readBigUInt64LE(1) <= BigInt(slot)
    );
  } catch {
    return false;
  }
}
/** Gate creation before spending time on routes; rechecked again at broadcast. */
export async function assertMainnetV1Ready(
  supportedTransactionVersions?: readonly number[],
): Promise<void> {
  if (!supportedTransactionVersions?.includes(1))
    throw new Error(
      "This wallet does not advertise V1 transaction signing. Update it or connect a compatible wallet to trade.",
    );
  await assertMainnet();
  if (!(await mainnetV1Active()))
    throw new Error(
      "V1 trading is waiting for activation on the configured Solana mainnet RPC. No transaction was created.",
    );
}
export async function latestBlockhash() {
  return (
    await mainnetRpc<{
      value: { blockhash: string; lastValidBlockHeight: number };
    }>("getLatestBlockhash", [{ commitment: "confirmed" }])
  ).value;
}
export async function simulateComposed(
  transaction: string,
  addresses: string[] = [],
) {
  const result = await mainnetRpc<{
    value: {
      err: unknown;
      unitsConsumed?: number;
      loadedAccountsDataSize?: number;
      accounts?: RpcAccount[];
    };
  }>("simulateTransaction", [
    transaction,
    {
      encoding: "base64",
      commitment: "confirmed",
      sigVerify: false,
      replaceRecentBlockhash: false,
      ...(addresses.length
        ? { accounts: { encoding: "base64", addresses } }
        : {}),
    },
  ]);
  if (result.value.err !== null)
    throw new Error(
      "This transaction did not pass mainnet simulation. Check your balance, SOL for fees, and available routes before trying again.",
    );
  return result.value;
}
function secret() {
  const value = process.env.KITE_TRADE_SECRET;
  if (!value || value.length < 32)
    throw new Error("Server transaction authorization is not configured.");
  return value;
}
export async function authorizeComposed(
  input: Omit<WalletTransactionOrder, "requestId" | "authorization">,
  investmentRun?: { planId: string; runId: string },
  investmentSetupHash?: string,
): Promise<WalletTransactionOrder> {
  const { transaction: tx, message } = await inspectWalletTransaction(
    input.transaction,
  );
  if (message.version !== 1 || input.transactionVersion !== 1)
    throw new Error("New transaction authorizations require V1.");
  const signers = Object.keys(tx.signatures);
  if (
    signers.length !== 1 ||
    signers[0] !== input.taker ||
    message.staticAccounts[0] !== input.taker
  )
    throw new Error(
      "The transaction must be signed and paid for by the selected wallet.",
    );
  const requestId = randomUUID();
  const payload = {
    kind: "kite-composed-v1",
    requestId,
    taker: input.taker,
    expiresAt: input.expiresAt,
    messageHash: createHash("sha256")
      .update(Buffer.from(tx.messageBytes))
      .digest("hex"),
    lastValidBlockHeight: input.lastValidBlockHeight,
    ...(investmentRun ? { investmentRun } : {}),
    ...(investmentSetupHash ? { investmentSetupHash } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    ...input,
    requestId,
    authorization:
      encoded +
      "." +
      createHmac("sha256", secret()).update(encoded).digest("base64url"),
  };
}
export async function verifyComposed(
  authorization: string,
  signed: string,
  recovery?: { acceptExpired: true },
) {
  const [encoded, mac, ...extra] = authorization.split(".");
  if (!encoded || !mac || extra.length)
    throw new Error("Invalid transaction authorization.");
  const expected = createHmac("sha256", secret()).update(encoded).digest();
  const received = Buffer.from(mac, "base64url");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    throw new Error("Invalid transaction authorization.");
  const p = JSON.parse(Buffer.from(encoded, "base64url").toString());
  if (
    p.kind !== "kite-composed-v1" ||
    !Number.isSafeInteger(p.expiresAt) ||
    (p.expiresAt <= Date.now() && !recovery?.acceptExpired)
  )
    throw new Error("This transaction authorization has expired.");
  const { transaction: tx, message } = await inspectWalletTransaction(signed);
  if (
    createHash("sha256").update(Buffer.from(tx.messageBytes)).digest("hex") !==
      p.messageHash ||
    Object.keys(tx.signatures).length !== 1 ||
    message.staticAccounts[0] !== p.taker
  )
    throw new Error(
      "The signed transaction differs from the reviewed transaction.",
    );
  const sig = tx.signatures[p.taker as keyof typeof tx.signatures];
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      new PublicKey(p.taker).toBuffer(),
    ]),
    format: "der",
    type: "spki",
  });
  if (
    !sig ||
    !verify(null, Buffer.from(tx.messageBytes), key, Buffer.from(sig))
  )
    throw new Error("A valid wallet signature is required.");
  return {
    investmentRun: p.investmentRun as
      { planId: string; runId: string } | undefined,
    investmentSetupHash: p.investmentSetupHash as string | undefined,
    version: message.version,
    taker: p.taker as string,
    messageHash: p.messageHash as string,
    lastValidBlockHeight: p.lastValidBlockHeight as number,
  };
}
