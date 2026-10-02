import { Buffer } from "buffer";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  countTransactionAccounts,
  validateBasketSwapLegs,
  type BasketOrder,
} from "./mainnet";
import {
  V0_MAX_BYTES,
  BASKET_MAX_ACCOUNTS,
  BASKET_MAX_TRANSACTIONS,
  TransactionCapacityError,
  isTransactionCapacityError,
} from "./transaction-limits";

import { compilePackedV0Message } from "./v0-lookup-packing";

export * from "./transaction-limits";
export const BUNDLE_ATOMICITY_WARNING =
  "Jito executes the bundle together in its block, but skipped blocks can expose individual transactions to rebroadcast. Partial execution is possible. Check every receipt before retrying.";

export interface BasketBundleOrder extends Omit<
  BasketOrder,
  "transaction" | "serializedBytes" | "transactionVersion"
> {
  kind: "bundle";
  transactions: string[];
  transactionVersion: 0 | 1;
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
  /** Accounts such as the Jito tip recipient that must never be loaded from an ALT. */
  staticAccountKeys?: readonly PublicKey[];
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
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: Math.floor((fee * 1_000_000) / units),
    }),
    ...params.instructions,
  ];
  if (
    countTransactionAccounts(params.payer, instructions) > BASKET_MAX_ACCOUNTS
  )
    throw new TransactionCapacityError(
      "Transaction exceeds the 64-account runtime limit.",
      "accounts",
    );
  const { message, wireLength } = compilePackedV0Message({
    payer,
    blockhash: params.blockhash,
    instructions,
    lookupTables: params.lookupTables ?? [],
    staticAccountKeys: params.staticAccountKeys ?? [],
  });
  const accountCount =
    message.staticAccountKeys.length +
    message.addressTableLookups.reduce(
      (total, table) =>
        total + table.readonlyIndexes.length + table.writableIndexes.length,
      0,
    );
  if (accountCount > BASKET_MAX_ACCOUNTS)
    throw new TransactionCapacityError(
      "Transaction exceeds the 64-account runtime limit.",
      "accounts",
    );
  if (wireLength > V0_MAX_BYTES)
    throw new TransactionCapacityError(
      "Transaction exceeds the 1232-byte v0 size limit.",
      "bytes",
    );
  const bytes = new VersionedTransaction(message).serialize();
  if (bytes.length > V0_MAX_BYTES)
    throw new TransactionCapacityError(
      "Transaction exceeds the 1232-byte v0 size limit.",
      "bytes",
    );
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
  /** @deprecated Routing depends on actual account/byte capacity, not asset count. */
  basketAssetCount?: number;
  finalTipInstruction?: TransactionInstruction;
  priorityFeeLamports?: number;
}): ComposedV0Chunk[] {
  validateBasketSwapLegs(params.legs);
  const build = (legs: BasketSwapLeg[], tip: boolean): ComposedV0Chunk => ({
    ...composeV0Transaction({
      payer: params.payer,
      blockhash: params.blockhash,
      lookupTables: params.lookupTables,
      staticAccountKeys:
        tip && params.finalTipInstruction?.keys[1]
          ? [params.finalTipInstruction.keys[1].pubkey]
          : [],
      priorityFeeLamports: params.priorityFeeLamports,
      instructions: [
        ...legs.flatMap((leg) => leg.instructions),
        ...(tip && params.finalTipInstruction
          ? [params.finalTipInstruction]
          : []),
      ],
    }),
    allocationIndexes: legs.map((leg) => leg.allocationIndex),
  });
  try {
    return [build(params.legs, false)];
  } catch (error) {
    if (!isTransactionCapacityError(error) || !params.finalTipInstruction)
      throw error;
  }
  const tipAccount = params.finalTipInstruction.keys[1]?.pubkey;
  if (!tipAccount) throw new Error("Invalid Jito tip instruction.");
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
        } catch (error) {
          if (!isTransactionCapacityError(error)) throw error;
          return null;
        }
      }
      for (let end = params.legs.length - remaining + 1; end > start; end--) {
        try {
          const first = build(params.legs.slice(start, end), false);
          const rest = partition(end, remaining - 1);
          if (rest) return [first, ...rest];
        } catch (error) {
          if (!isTransactionCapacityError(error)) throw error;
          /* Try a smaller chunk without changing any allocation. */
        }
      }
      return null;
    };
    const chunks = partition(0, count);
    if (chunks) return chunks;
  }
  throw new TransactionCapacityError(
    "This basket cannot fit within five transactions at current routes. No partial order was created.",
    "bundle",
  );
}
