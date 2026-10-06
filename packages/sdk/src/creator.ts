import type { ProgrammableBasket } from "./basket/custom";

export interface PublishedCreatorBasket extends ProgrammableBasket {
  creatorWallet: string;
  publishedAt: string;
}

export interface CreatorStats {
  creatorWallet: string;
  publishedBaskets: number;
  activeSubscribers: number;
  volumeUsdcBaseUnits: string;
  points: string;
  devnet: { activeSubscribers: number; volumeBaseUnits: string };
  asOf: string;
}

/** Real USDC volume earns one point per $100; an active subscriber earns 100.
 * Callers must supply confirmed, deduplicated mainnet receipts only. */
export function calculateCreatorPoints(
  volumeUsdcBaseUnits: string,
  activeSubscribers: number,
): string {
  if (
    !/^\d{1,60}$/.test(volumeUsdcBaseUnits) ||
    !Number.isSafeInteger(activeSubscribers) ||
    activeSubscribers < 0
  ) {
    throw new Error("Invalid creator activity totals.");
  }
  return (
    BigInt(volumeUsdcBaseUnits) / 100_000_000n +
    BigInt(activeSubscribers) * 100n
  ).toString();
}
