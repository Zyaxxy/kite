export interface WeightedAllocation {
  mint: string;
  weightBps: number;
}

export const BASKET_INPUT_OVERSPEND_BASE_UNITS = 50n;
export const BASKET_INPUT_UNDERSPEND_BASE_UNITS = 100n;

/** Raw funding-token units, independent of token decimals or slippage. */
export function basketInputDebitBounds(reviewedAmount: bigint) {
  const u64Max = (1n << 64n) - 1n;
  if (reviewedAmount <= 0n || reviewedAmount > u64Max)
    throw new Error("Invalid reviewed basket debit.");
  return {
    minimum:
      reviewedAmount > BASKET_INPUT_UNDERSPEND_BASE_UNITS
        ? reviewedAmount - BASKET_INPUT_UNDERSPEND_BASE_UNITS
        : 1n,
    maximum:
      reviewedAmount <= u64Max - BASKET_INPUT_OVERSPEND_BASE_UNITS
        ? reviewedAmount + BASKET_INPUT_OVERSPEND_BASE_UNITS
        : u64Max,
  };
}

/** Enforce the reviewed debit with a +50 / -100 base-unit allowance.
 * Callers must first validate exact encoded allocations and every minimum output,
 * and independently protect existing intermediate balances. A lower debit cannot
 * establish a complete fill by itself. Unspent input remains in the owner wallet.
 */
export function validateBasketInputDebit(
  reviewedAmount: bigint,
  observedDebit: bigint,
): bigint {
  const { minimum, maximum } = basketInputDebitBounds(reviewedAmount);
  if (observedDebit <= 0n)
    throw new Error("The simulated input debit must be positive.");
  const unspent = reviewedAmount - observedDebit;
  if (observedDebit < minimum || observedDebit > maximum)
    throw new Error(
      `The simulated input debit is outside the reviewed range (allowed ${minimum}–${maximum} base units, observed ${observedDebit}).`,
    );
  return unspent;
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
