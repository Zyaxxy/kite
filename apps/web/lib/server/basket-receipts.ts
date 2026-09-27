import { MAINNET_USDC_MINT } from "@kite/sdk";
import { recordCreatorVolume } from "./creator-store";
import type { BasketReceipt } from "./bundle-authorization";

/** Only server-authorized amounts and confirmed chain receipts can award creator volume. */
export async function recordConfirmedBasketReceipt(
  receipt: BasketReceipt | undefined,
  taker: string,
  signature: string,
) {
  if (!receipt || receipt.inputMint !== MAINNET_USDC_MINT) return;
  try {
    await recordCreatorVolume({
      basketId: receipt.basketId,
      signature,
      owner: taker,
      amountBaseUnits: receipt.inAmount,
      network: "mainnet-beta",
    });
  } catch {
    // An analytics store failure must not turn a confirmed purchase into a retryable trade error.
    console.warn("[creator-volume] confirmed receipt attribution unavailable");
  }
}
