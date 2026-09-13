import {
  allocateBasketInput,
  type WeightedAllocation,
} from "./basket/atomic-swap";

export interface BasketDrift {
  mint: string;
  currentValueUsdMicros: bigint;
  targetValueUsdMicros: bigint;
  deltaValueUsdMicros: bigint;
  currentWeightBps: number;
  targetWeightBps: number;
  action: "buy" | "sell" | "hold";
}

/** Valuations must come from one sufficiently recent, real price snapshot. This is
 * an allocation proposal, not executable token quantities or a guaranteed quote. */
export function calculateBasketRebalance(params: {
  targets: readonly WeightedAllocation[];
  holdings: readonly { mint: string; valueUsdMicros: bigint }[];
  cashUsdMicros?: bigint;
  thresholdBps?: number;
}): {
  totalValueUsdMicros: bigint;
  legs: BasketDrift[];
  projectedCashUsdMicros: bigint;
  fullyFunded: boolean;
} {
  const cash = params.cashUsdMicros ?? 0n;
  const threshold = params.thresholdBps ?? 50;
  if (
    cash < 0n ||
    !Number.isInteger(threshold) ||
    threshold < 0 ||
    threshold > 10_000
  )
    throw new Error("Invalid cash balance or rebalance threshold.");
  if (
    new Set(params.holdings.map((holding) => holding.mint)).size !==
      params.holdings.length ||
    params.holdings.some((holding) => holding.valueUsdMicros < 0n)
  )
    throw new Error("Holdings must be unique and non-negative.");
  const allowed = new Set(params.targets.map((asset) => asset.mint));
  if (params.holdings.some((holding) => !allowed.has(holding.mint)))
    throw new Error(
      "Only holdings explicitly included in this basket may be rebalanced.",
    );
  const values = new Map(
    params.holdings.map((holding) => [holding.mint, holding.valueUsdMicros]),
  );
  const total =
    cash +
    params.holdings.reduce((sum, holding) => sum + holding.valueUsdMicros, 0n);
  if (total === 0n)
    throw new Error(
      "A priced portfolio balance is required to calculate drift.",
    );
  const allocation = allocateBasketInput(total, params.targets);
  const legs: BasketDrift[] = allocation.map((target, index) => {
    const current = values.get(target.mint) ?? 0n;
    const delta = target.amount - current;
    const drift = (delta < 0n ? -delta : delta) * 10_000n;
    return {
      mint: target.mint,
      currentValueUsdMicros: current,
      targetValueUsdMicros: target.amount,
      deltaValueUsdMicros: delta,
      currentWeightBps: Number((current * 10_000n) / total),
      targetWeightBps: params.targets[index].weightBps,
      action:
        delta === 0n || drift < total * BigInt(threshold)
          ? "hold"
          : delta > 0n
            ? "buy"
            : "sell",
    };
  });
  // Skipping a small sell for the drift threshold must not hide a funding shortfall.
  const projectedCash =
    cash -
    legs.reduce(
      (sum, leg) =>
        sum + (leg.action === "hold" ? 0n : leg.deltaValueUsdMicros),
      0n,
    );
  return {
    totalValueUsdMicros: total,
    legs,
    projectedCashUsdMicros: projectedCash,
    fullyFunded: projectedCash >= 0n,
  };
}

/** Each period must be bounded immediately after/before external cash flows.
 * Without those valuations, TWR cannot be inferred from a balance snapshot. */
export function calculateTimeWeightedReturn(
  periods: readonly { openingValue: number; closingValue: number }[],
): number | null {
  if (
    !periods.length ||
    periods.some(
      ({ openingValue, closingValue }) =>
        !Number.isFinite(openingValue) ||
        !Number.isFinite(closingValue) ||
        openingValue <= 0 ||
        closingValue < 0,
    )
  )
    return null;
  const growth = periods.reduce(
    (total, period) => (total * period.closingValue) / period.openingValue,
    1,
  );
  return Number.isFinite(growth) ? growth - 1 : null;
}
