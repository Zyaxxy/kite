/** Audit inputs, not a guarantee that a future quote or transaction will succeed. */
export const BASKET_QUOTE_REVIEW_POLICY = {
  basketAmountsUsdc: [100, 1000] as readonly number[],
  slippageBps: 100,
  maxAccountsPerLeg: 32,
  maxRoundTripLossBps: 200,
  maxBasketAccounts: 64,
  maxV1Bytes: 4096,
} as const;

/** Compare exact raw USDC quantities; a display rounding must never pass a bad quote. */
export function assessBasketRoundTrip(
  inputRaw: string,
  returnedRaw: string | null,
  maxLossBps = BASKET_QUOTE_REVIEW_POLICY.maxRoundTripLossBps,
): { passes: boolean; lossBps: number | null } {
  const valid = (value: string): boolean =>
    /^\d{1,20}$/.test(value) && BigInt(value) > 0n && BigInt(value) < 2n ** 64n;
  if (
    !Number.isInteger(maxLossBps) ||
    maxLossBps < 0 ||
    maxLossBps > 10_000 ||
    !valid(inputRaw) ||
    returnedRaw === null ||
    !valid(returnedRaw)
  )
    return { passes: false, lossBps: null };
  const input = BigInt(inputRaw),
    returned = BigInt(returnedRaw);
  return {
    passes: returned * 10_000n >= input * BigInt(10_000 - maxLossBps),
    lossBps: Number((input - returned) * 10_000n) / Number(input),
  };
}
