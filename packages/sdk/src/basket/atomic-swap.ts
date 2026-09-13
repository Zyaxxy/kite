import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export const CURRENT_TRANSACTION_MAX_BYTES = 1232;
export class AtomicBasketCapacityError extends Error {
  constructor(
    message = "This basket does not fit in one supported transaction. No partial transactions were created.",
  ) {
    super(message);
    this.name = "AtomicBasketCapacityError";
  }
}
export interface WeightedAllocation {
  mint: string;
  weightBps: number;
}

/** Largest remainder allocation conserves every input unit, including indivisible dust. */
export function allocateBasketInput(
  amount: bigint,
  assets: readonly WeightedAllocation[],
): { mint: string; amount: bigint }[] {
  if (amount <= 0n || amount > (1n << 64n) - 1n)
    throw new Error("Basket input must be a positive u64 token amount.");
  if (
    !assets.length ||
    assets.length > 12 ||
    new Set(assets.map((asset) => asset.mint)).size !== assets.length ||
    assets.some(
      (asset) => !Number.isInteger(asset.weightBps) || asset.weightBps <= 0,
    ) ||
    assets.reduce((sum, asset) => sum + asset.weightBps, 0) !== 10_000
  )
    throw new Error(
      "Basket weights must be unique, positive and total 10000 basis points.",
    );
  const allocations = assets.map((asset, index) => ({
    mint: asset.mint,
    amount: (amount * BigInt(asset.weightBps)) / 10_000n,
    remainder: (amount * BigInt(asset.weightBps)) % 10_000n,
    index,
  }));
  let remaining =
    amount - allocations.reduce((sum, asset) => sum + asset.amount, 0n);
  for (const asset of [...allocations].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (remaining === 0n) break;
    asset.amount += 1n;
    remaining -= 1n;
  }
  if (allocations.some((asset) => asset.amount === 0n))
    throw new Error("Input amount is too small to fund every basket leg.");
  return allocations.map(({ mint, amount: allocated }) => ({
    mint,
    amount: allocated,
  }));
}

/** Compose trusted, already-validated route instructions atomically. No route fetching,
 * min-output inference, or partial-fill fallback. Callers must validate each quote and
 * simulate the assembled transaction before offering it to a wallet. */
export function buildAtomicBasketTransaction(params: {
  payer: PublicKey;
  recentBlockhash: string;
  legs: readonly (readonly TransactionInstruction[])[];
  lookupTables?: AddressLookupTableAccount[];
  computeUnitLimit: number;
  computeUnitPriceMicroLamports?: bigint;
}): { transaction: VersionedTransaction; serializedBytes: number; version: 0 } {
  if (
    !params.legs.length ||
    params.legs.length > 12 ||
    params.legs.some((leg) => !leg.length)
  )
    throw new Error("Every basket leg needs validated route instructions.");
  if (
    !Number.isInteger(params.computeUnitLimit) ||
    params.computeUnitLimit < 1 ||
    params.computeUnitLimit > 1_400_000
  )
    throw new Error("Invalid transaction compute limit.");
  const price = params.computeUnitPriceMicroLamports ?? 0n;
  if (price < 0n || price > (1n << 64n) - 1n)
    throw new Error("Invalid priority fee.");
  const instructions = params.legs.flatMap((leg) => [...leg]);
  // A single budget is mandatory: concatenating per-route budgets creates duplicate
  // instructions and can accidentally multiply user-unreviewed fee settings.
  if (
    instructions.some((instruction) =>
      instruction.programId.equals(ComputeBudgetProgram.programId),
    )
  )
    throw new Error(
      "Pass one explicit basket compute budget; remove per-route budget instructions first.",
    );
  if (
    instructions.some((instruction) =>
      instruction.keys.some(
        (key) => key.isSigner && !key.pubkey.equals(params.payer),
      ),
    )
  )
    throw new Error("Basket routes require an unsupported additional signer.");
  try {
    const message = new TransactionMessage({
      payerKey: params.payer,
      recentBlockhash: params.recentBlockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({
          units: params.computeUnitLimit,
        }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }),
        ...instructions,
      ],
    }).compileToV0Message(params.lookupTables);
    const accounts =
      message.staticAccountKeys.length +
      message.addressTableLookups.reduce(
        (sum, table) =>
          sum + table.readonlyIndexes.length + table.writableIndexes.length,
        0,
      );
    if (accounts > 64)
      throw new AtomicBasketCapacityError(
        "The basket exceeds the supported 64-account transaction limit.",
      );
    const transaction = new VersionedTransaction(message);
    const serializedBytes = transaction.serialize().length;
    if (serializedBytes > CURRENT_TRANSACTION_MAX_BYTES)
      throw new AtomicBasketCapacityError();
    return { transaction, serializedBytes, version: 0 };
  } catch (error) {
    if (error instanceof AtomicBasketCapacityError) throw error;
    throw new AtomicBasketCapacityError(
      "The basket could not be encoded within the supported v0 transaction limits.",
    );
  }
}
