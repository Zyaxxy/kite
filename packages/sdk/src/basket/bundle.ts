import { Buffer } from "buffer";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { BasketOrder } from "./mainnet";

export const V0_MAX_BYTES = 1232;
export const BASKET_MAX_ACCOUNTS = 64;
export const BASKET_MAX_TRANSACTIONS = 3;
export const BUNDLE_ATOMICITY_WARNING =
  "Jito executes the bundle together in its block, but skipped blocks can expose individual transactions to rebroadcast. Partial execution is possible. Check every receipt before retrying.";

export interface BasketBundleOrder extends Omit<
  BasketOrder,
  "transaction" | "serializedBytes" | "transactionVersion"
> {
  kind: "bundle";
  transactions: string[];
  transactionVersion: 0;
  serializedBytes: number[];
  tipLamports: number;
  atomicityWarning: string;
}
export type BasketPurchaseOrder = BasketOrder | BasketBundleOrder;
export interface BasketBundleExecution {
  status: "Pending" | "Success" | "Failed" | "Unknown";
  bundleId?: string;
  signatures: string[];
  statusAuthorization?: string;
  error?: string;
}
export interface BasketSwapLeg {
  /** Index in the reviewed allocations; no instruction is split across transactions. */
  allocationIndex: number;
  instructions: TransactionInstruction[];
}
export interface ComposedV0Chunk {
  transaction: string;
  serializedBytes: number;
  transactionVersion: 0;
  accountCount: number;
  allocationIndexes: number[];
}

/** ALTs compress bytes, never the number of runtime account locks. */
export function composeV0Transaction(params: {
  payer: string;
  blockhash: string;
  instructions: TransactionInstruction[];
  lookupTables?: AddressLookupTableAccount[];
  priorityFeeLamports?: number;
  computeUnitLimit?: number;
}): Omit<ComposedV0Chunk, "allocationIndexes"> {
  const units = params.computeUnitLimit ?? 1_400_000;
  const fee = params.priorityFeeLamports ?? 10_000;
  if (
    !Number.isSafeInteger(units) ||
    units < 1 ||
    units > 1_400_000 ||
    !Number.isSafeInteger(fee) ||
    fee < 0 ||
    fee > 100_000
  )
    throw new Error("Invalid transaction resource budget.");
  if (
    params.instructions.some((ix) =>
      ix.programId.equals(ComputeBudgetProgram.programId),
    )
  )
    throw new Error(
      "Route instructions cannot override transaction resource limits.",
    );
  const payer = new PublicKey(params.payer);
  if (
    params.instructions.some((ix) =>
      ix.keys.some((key) => key.isSigner && !key.pubkey.equals(payer)),
    )
  )
    throw new Error("Unsupported additional signer.");
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: params.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: Math.floor((fee * 1_000_000) / units),
      }),
      ...params.instructions,
    ],
  }).compileToV0Message(params.lookupTables ?? []);
  const accountCount =
    message.staticAccountKeys.length +
    message.addressTableLookups.reduce(
      (total, table) =>
        total + table.readonlyIndexes.length + table.writableIndexes.length,
      0,
    );
  if (accountCount > BASKET_MAX_ACCOUNTS)
    throw new Error("Transaction exceeds the 64-account runtime limit.");
  let bytes: Uint8Array;
  try {
    bytes = new VersionedTransaction(message).serialize();
  } catch {
    throw new Error("Transaction exceeds the 1232-byte v0 size limit.");
  }
  if (bytes.length > V0_MAX_BYTES)
    throw new Error("Transaction exceeds the 1232-byte v0 size limit.");
  return {
    transaction: Buffer.from(bytes).toString("base64"),
    serializedBytes: bytes.length,
    transactionVersion: 0,
    accountCount,
  };
}

/** Exhaustive contiguous partitioning (at most 12 legs) prevents a greedy last-tip overflow. */
export function composeBasketV0Chunks(params: {
  payer: string;
  blockhash: string;
  legs: BasketSwapLeg[];
  lookupTables: AddressLookupTableAccount[];
  basketAssetCount: number;
  finalTipInstruction?: TransactionInstruction;
}): ComposedV0Chunk[] {
  if (
    !params.legs.length ||
    params.legs.length > 12 ||
    new Set(params.legs.map((leg) => leg.allocationIndex)).size !==
      params.legs.length
  )
    throw new Error("Invalid basket execution legs.");
  const build = (legs: BasketSwapLeg[], tip: boolean): ComposedV0Chunk => ({
    ...composeV0Transaction({
      payer: params.payer,
      blockhash: params.blockhash,
      lookupTables: params.lookupTables,
      instructions: [
        ...legs.flatMap((leg) => leg.instructions),
        ...(tip && params.finalTipInstruction
          ? [params.finalTipInstruction]
          : []),
      ],
    }),
    allocationIndexes: legs.map((leg) => leg.allocationIndex),
  });
  // Small baskets always stay atomic at the chain transaction level; never silently split them.
  if (params.basketAssetCount <= 4) {
    try {
      return [build(params.legs, false)];
    } catch (error) {
      if (params.basketAssetCount <= 3) throw error;
    }
  }
  if (!params.finalTipInstruction)
    throw new Error(
      "A reviewed Jito tip is required for a multi-transaction basket.",
    );
  const tipAccount = params.finalTipInstruction.keys[1]?.pubkey;
  if (
    !tipAccount ||
    params.lookupTables.some((table) =>
      table.state.addresses.some((key) => key.equals(tipAccount)),
    )
  )
    throw new Error(
      "Jito tip accounts must remain static, outside lookup tables.",
    );
  for (
    let count = 2;
    count <= Math.min(BASKET_MAX_TRANSACTIONS, params.legs.length);
    count++
  ) {
    const partition = (
      start: number,
      remaining: number,
    ): ComposedV0Chunk[] | null => {
      if (remaining === 1) {
        try {
          return [build(params.legs.slice(start), true)];
        } catch {
          return null;
        }
      }
      for (let end = params.legs.length - remaining + 1; end > start; end--) {
        try {
          const first = build(params.legs.slice(start, end), false);
          const rest = partition(end, remaining - 1);
          if (rest) return [first, ...rest];
        } catch {
          /* Try a smaller chunk without changing any allocation. */
        }
      }
      return null;
    };
    const chunks = partition(0, count);
    if (chunks) return chunks;
  }
  throw new Error(
    "This basket cannot fit within three transactions at current routes. No partial order was created.",
  );
}
