import { validateProgrammableBasket } from "@kite/sdk";

export const RECURRING_CADENCES = {
  daily: { seconds: 86400, label: "Every day" },
  weekly: { seconds: 604800, label: "Every week" },
  biweekly: { seconds: 1209600, label: "Every two weeks" },
  monthly: { seconds: 2592000, label: "Every 30 days" },
} as const;

export function recurringDeepLink(search: string) {
  const params = new URLSearchParams(search);
  const cadence = params.get("cadence");
  const basket = params.get("basket");
  return {
    periodSeconds:
      cadence && Object.hasOwn(RECURRING_CADENCES, cadence)
        ? RECURRING_CADENCES[cadence as keyof typeof RECURRING_CADENCES].seconds
        : undefined,
    basketId: basket && /^[A-Za-z0-9-]{1,40}$/.test(basket) ? basket : null,
  };
}

/** A published allocation is selectable only when every underlying asset has a real provisioned devnet mapping. */
export function publishedRecurringOption(
  id: string,
  value: unknown,
  stocks: ReadonlyArray<{ id: string; available: boolean }>,
) {
  if (
    !/^creator-[a-f0-9]{24}$/.test(id) ||
    !value ||
    typeof value !== "object" ||
    !("creatorWallet" in value) ||
    typeof value.creatorWallet !== "string"
  )
    throw new Error("The published basket could not be verified.");
  const basket = validateProgrammableBasket(value);
  if (basket.id !== id)
    throw new Error("The published basket does not match this link.");
  const symbols = basket.allocations.map((allocation) => allocation.symbol);
  const available =
    new Set(symbols).size === symbols.length &&
    symbols.every((symbol) =>
      stocks.some((stock) => stock.id === symbol && stock.available),
    );
  return { id, name: basket.name, ticker: basket.ticker, available };
}
