import { Buffer } from "buffer";
import {
  PublicKey,
  TransactionInstruction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import type { BasketSwapLeg } from "./bundle";
import {
  BASKET_MAX_ACCOUNTS,
  BASKET_MAX_LEGS,
  BASKET_MAX_TRANSACTIONS,
  V1_MAX_BYTES,
  TransactionCapacityError,
  isTransactionCapacityError,
} from "./transaction-limits";

/** Includes payer and invoked programs; V1 uses only inline static accounts. */
export function countTransactionAccounts(
  payer: string,
  instructions: TransactionInstruction[],
): number {
  const accounts = new Set([new PublicKey(payer).toBase58()]);
  for (const ix of instructions) {
    accounts.add(ix.programId.toBase58());
    for (const key of ix.keys) accounts.add(key.pubkey.toBase58());
  }
  return accounts.size;
}

export function validateBasketSwapLegs(legs: BasketSwapLeg[]): void {
  if (
    !legs.length ||
    legs.length > BASKET_MAX_LEGS ||
    legs.some(
      (leg) =>
        !Number.isSafeInteger(leg.allocationIndex) ||
        leg.allocationIndex < 0 ||
        leg.allocationIndex >= BASKET_MAX_LEGS ||
        !leg.instructions.length,
    ) ||
    new Set(legs.map((leg) => leg.allocationIndex)).size !== legs.length
  )
    throw new Error("Invalid basket execution legs.");
}

export interface WalletTransactionOrder {
  /** Bound by the server authorization hash; stored only after a valid owner signature. */
  investmentSetup?: import("../recurring-investing").RecurringInvestmentPlan;
  requestId: string;
  transaction: string;
  authorization: string;
  taker: string;
  expiresAt: number;
  transactionVersion: 0 | 1;
  serializedBytes: number;
  lastValidBlockHeight: number;
}
export interface BasketOrderRequest {
  basketId: string;
  inputMint: string;
  amount: string;
  taker: string;
  slippageBps: number;
  supportedTransactionVersions?: number[];
  customAllocations?: Array<{ mint: string; weightBps: number }>;
}
export interface BasketOrder extends WalletTransactionOrder {
  basketId: string;
  inputMint: string;
  inputDecimals: number;
  inAmount: string;
  slippageBps: number;
  priorityFeeLamports: number;
  outputs: {
    mint: string;
    symbol: string;
    decimals: number;
    inputAmount: string;
    outAmount: string;
    minimumAmount: string;
    weightBps: number;
  }[];
}
export interface RecurringPayment {
  address: string;
  owner: string;
  buyer: string;
  mint: string;
  amountPerPeriod: string;
  periodSeconds: number;
  startsAt: number;
  expiresAt: number;
  pulledInPeriod: string;
  currentPeriodStartedAt: number;
}
export interface RecurringPaymentRequest {
  taker: string;
  buyer: string;
  mint: string;
  amount: string;
  periodSeconds: number;
  periods: number;
  supportedTransactionVersions?: number[];
}

/** Instruction conversion is structural: no private keys or signing happens here. */
export function kitInstructionToWeb3(ix: {
  programAddress: string;
  accounts?: readonly { address: string; role: number }[];
  data?: ArrayLike<number>;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a) => ({
      pubkey: new PublicKey(a.address),
      isWritable: (a.role & 1) !== 0,
      isSigner: (a.role & 2) !== 0,
    })),
    data: Buffer.from(ix.data ?? []),
  });
}

/** Compose an unsigned V1 message. Callers must verify cluster and wallet capability. */
export async function composeV1Transaction(params: {
  payer: string;
  blockhash: string;
  lastValidBlockHeight: number;
  instructions: TransactionInstruction[];
  lookupTables?: AddressLookupTableAccount[];
  allowV1: boolean;
  computeUnitLimit?: number;
  loadedAccountsDataSizeLimit?: number;
  priorityFeeLamports?: number;
}): Promise<{
  transaction: string;
  serializedBytes: number;
  transactionVersion: 1;
  accountCount: number;
}> {
  const units = params.computeUnitLimit ?? 1_400_000;
  const fee = params.priorityFeeLamports ?? 10_000;
  if (!Number.isInteger(fee) || fee < 0 || fee > 100_000)
    throw new Error("Invalid priority fee limit.");
  if (!params.allowV1)
    throw new Error(
      "V1 transactions require an activated cluster and a wallet that supports V1 signing. No transaction was created.",
    );
  if (params.lookupTables?.length)
    throw new Error(
      "V1 transactions inline static accounts and cannot use lookup tables.",
    );
  if (
    !Number.isSafeInteger(params.lastValidBlockHeight) ||
    params.lastValidBlockHeight <= 0
  )
    throw new Error("Invalid transaction blockheight.");
  const kit = await import("@solana/kit-v1");
  if (!Number.isInteger(units) || units < 1 || units > 1_400_000)
    throw new Error("Invalid compute budget.");
  const dataLimit = params.loadedAccountsDataSizeLimit ?? 64 * 1024 * 1024;
  if (
    !Number.isInteger(dataLimit) ||
    dataLimit < 1 ||
    dataLimit > 64 * 1024 * 1024
  )
    throw new Error("Invalid loaded-account data budget.");
  const accounts = new Set([params.payer]);
  for (const ix of params.instructions) {
    if (
      ix.programId.toBase58() === "ComputeBudget111111111111111111111111111111"
    )
      throw new Error("V1 resource limits belong in the message config.");
    accounts.add(ix.programId.toBase58());
    for (const key of ix.keys) {
      if (key.isSigner && key.pubkey.toBase58() !== params.payer)
        throw new Error("Unsupported additional signer.");
      accounts.add(key.pubkey.toBase58());
    }
  }
  if (accounts.size > BASKET_MAX_ACCOUNTS)
    throw new TransactionCapacityError(
      "This basket exceeds the 64-account limit, including on V1. No partial order was created.",
      "accounts",
    );
  const message = kit.pipe(
    kit.createTransactionMessage({ version: 1 }),
    (m) => kit.setTransactionMessageFeePayer(kit.address(params.payer), m),
    (m) =>
      kit.setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: kit.blockhash(params.blockhash),
          lastValidBlockHeight: BigInt(params.lastValidBlockHeight),
        },
        m,
      ),
    (m) => kit.setTransactionMessageComputeUnitLimit(units, m),
    (m) => kit.setTransactionMessageLoadedAccountsDataSizeLimit(dataLimit, m),
    (m) => kit.setTransactionMessagePriorityFeeLamports(BigInt(fee), m),
    (m) =>
      kit.appendTransactionMessageInstructions(
        params.instructions.map((ix) => ({
          programAddress: kit.address(ix.programId.toBase58()),
          data: new Uint8Array(ix.data),
          accounts: ix.keys.map((key) => ({
            address: kit.address(key.pubkey.toBase58()),
            role: (key.isSigner ? 2 : 0) + (key.isWritable ? 1 : 0),
          })),
        })),
        m,
      ),
  );
  const bytes = kit
    .getTransactionEncoder()
    .encode(kit.compileTransaction(message));
  if (bytes.length > V1_MAX_BYTES)
    throw new TransactionCapacityError(
      "This basket exceeds the V1 transaction size limit. No partial order was created.",
      "bytes",
    );
  return {
    transaction: Buffer.from(bytes).toString("base64"),
    serializedBytes: bytes.length,
    transactionVersion: 1,
    accountCount: accounts.size,
  };
}

export interface ComposedV1Chunk {
  transaction: string;
  serializedBytes: number;
  transactionVersion: 1;
  accountCount: number;
  allocationIndexes: number[];
}

/** Single-first, capacity-driven routing. Every leg remains intact and in review order. */
export async function composeBasketV1Chunks(params: {
  payer: string;
  blockhash: string;
  lastValidBlockHeight: number;
  legs: BasketSwapLeg[];
  allowV1: boolean;
  finalTipInstruction?: TransactionInstruction;
  priorityFeeLamports?: number;
}): Promise<ComposedV1Chunk[]> {
  validateBasketSwapLegs(params.legs);
  const build = async (
    start: number,
    end: number,
    tip: boolean,
  ): Promise<ComposedV1Chunk> => ({
    ...(await composeV1Transaction({
      payer: params.payer,
      blockhash: params.blockhash,
      lastValidBlockHeight: params.lastValidBlockHeight,
      allowV1: params.allowV1,
      priorityFeeLamports: params.priorityFeeLamports,
      instructions: [
        ...params.legs.slice(start, end).flatMap((leg) => leg.instructions),
        ...(tip && params.finalTipInstruction
          ? [params.finalTipInstruction]
          : []),
      ],
    })),
    allocationIndexes: params.legs
      .slice(start, end)
      .map((leg) => leg.allocationIndex),
  });
  try {
    return [await build(0, params.legs.length, false)];
  } catch (error) {
    if (!isTransactionCapacityError(error) || !params.finalTipInstruction)
      throw error;
  }

  // At most 78 distinct contiguous slices. Cache attempts instead of recompiling
  // overlapping partitions, including final-tip account and byte overhead.
  const cache = new Map<string, ComposedV1Chunk | null>();
  const fit = async (start: number, end: number, tip: boolean) => {
    const key = `${start}:${end}:${tip}`;
    if (cache.has(key)) return cache.get(key)!;
    let chunk: ComposedV1Chunk | null;
    try {
      chunk = await build(start, end, tip);
    } catch (error) {
      if (!isTransactionCapacityError(error)) throw error;
      chunk = null;
    }
    cache.set(key, chunk);
    return chunk;
  };
  for (
    let count = 2;
    count <= Math.min(BASKET_MAX_TRANSACTIONS, params.legs.length);
    count++
  ) {
    const partition = async (
      start: number,
      remaining: number,
    ): Promise<ComposedV1Chunk[] | null> => {
      if (remaining === 1) {
        const last = await fit(start, params.legs.length, true);
        return last ? [last] : null;
      }
      for (let end = params.legs.length - remaining + 1; end > start; end--) {
        const first = await fit(start, end, false);
        if (!first) continue;
        const rest = await partition(end, remaining - 1);
        if (rest) return [first, ...rest];
      }
      return null;
    };
    const chunks = await partition(0, count);
    if (chunks) return chunks;
  }
  throw new TransactionCapacityError(
    "This basket cannot fit within five transactions at current routes. No partial order was created.",
    "bundle",
  );
}

/** Backwards-compatible name for existing mainnet callers with their own cluster gates. */
export const composeMainnetTransaction = composeV1Transaction;

export async function inspectWalletTransaction(encoded: string) {
  const kit = await import("@solana/kit-v1");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error("Invalid transaction encoding.");
  const bytes = Buffer.from(encoded, "base64");
  const transaction = kit.getTransactionDecoder().decode(bytes);
  const message = kit
    .getCompiledTransactionMessageDecoder()
    .decode(transaction.messageBytes);
  if (bytes.length > (message.version === 1 ? 4096 : 1232))
    throw new Error("Unsupported transaction size.");
  return { transaction, message, bytes };
}

/** Derive the explorer ID before submission, including when the HTTP response is lost. */
export async function walletTransactionSignature(
  encoded: string,
): Promise<string> {
  const kit = await import("@solana/kit-v1");
  const { transaction } = await inspectWalletTransaction(encoded);
  const signature = Object.values(transaction.signatures)[0];
  if (!signature || signature.every((byte) => byte === 0))
    throw new Error("The wallet did not sign this transaction.");
  return kit.getBase58Decoder().decode(signature);
}
