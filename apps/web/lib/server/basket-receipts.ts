import { MAINNET_USDC_MINT } from "@kite/sdk";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { recordCreatorVolume } from "./creator-store";
import { assertMainnet, mainnetRpc } from "./composed-transactions";
import type { BasketReceipt } from "./bundle-authorization";

interface TokenBalance {
  accountIndex: number;
  owner?: string;
  mint: string;
  uiTokenAmount: { amount: string; decimals: number };
}
interface TransactionReceipt {
  slot: number;
  transaction: { signatures: string[]; message: { accountKeys: string[] } };
  meta: {
    err: unknown;
    preTokenBalances: TokenBalance[];
    postTokenBalances: TokenBalance[];
    loadedAddresses?: { writable: string[]; readonly: string[] };
  } | null;
}

/** Credit actual confirmed funding debits, never unspent rounding dust. */
export async function recordConfirmedBasketReceipt(
  receipt: BasketReceipt | undefined,
  taker: string,
  signature: string,
  signatures: readonly string[] = [signature],
) {
  if (
    !receipt ||
    receipt.inputMint !== MAINNET_USDC_MINT ||
    !/^creator-[a-f0-9]{24}$/.test(receipt.basketId)
  )
    return;
  try {
    if (
      signatures.length < 1 ||
      signatures.length > 5 ||
      signatures[0] !== signature ||
      new Set(signatures).size !== signatures.length
    )
      throw new Error("Invalid confirmed basket signatures.");
    await assertMainnet();
    const source = getAssociatedTokenAddressSync(
      new PublicKey(receipt.inputMint),
      new PublicKey(taker),
    ).toBase58();
    const observed = await Promise.all(
      signatures.map(async (expectedSignature) => {
        const chain = await mainnetRpc<TransactionReceipt | null>(
          "getTransaction",
          [
            expectedSignature,
            {
              encoding: "json",
              commitment: "confirmed",
              maxSupportedTransactionVersion: 1,
            },
          ],
        );
        if (
          !chain?.meta ||
          chain.meta.err !== null ||
          !Number.isSafeInteger(chain.slot) ||
          chain.transaction.signatures[0] !== expectedSignature ||
          chain.transaction.message.accountKeys[0] !== taker ||
          !Array.isArray(chain.meta.preTokenBalances) ||
          !Array.isArray(chain.meta.postTokenBalances)
        )
          throw new Error("Confirmed funding receipt is unavailable.");
        const keys = [
          ...chain.transaction.message.accountKeys,
          ...(chain.meta.loadedAddresses?.writable ?? []),
          ...(chain.meta.loadedAddresses?.readonly ?? []),
        ];
        const sourceIndex = keys.indexOf(source);
        if (sourceIndex < 0)
          throw new Error("Confirmed funding account is unavailable.");
        const amount = (balances: TokenBalance[]) => {
          const matching = balances.filter(
            (balance) => balance.accountIndex === sourceIndex,
          );
          const balance = matching[0];
          if (
            matching.length !== 1 ||
            balance.mint !== receipt.inputMint ||
            balance.owner !== taker ||
            balance.uiTokenAmount.decimals !== 6 ||
            !/^\d{1,20}$/.test(balance.uiTokenAmount.amount) ||
            BigInt(balance.uiTokenAmount.amount) >
              BigInt("18446744073709551615")
          )
            throw new Error("Confirmed funding balance is unavailable.");
          return BigInt(balance.uiTokenAmount.amount);
        };
        return {
          slot: chain.slot,
          debit:
            amount(chain.meta.preTokenBalances) -
            amount(chain.meta.postTokenBalances),
        };
      }),
    );
    const debit = observed.reduce((sum, item) => sum + item.debit, BigInt(0));
    if (
      observed.some(
        (item) => item.slot !== observed[0].slot || item.debit <= BigInt(0),
      ) ||
      debit <= BigInt(0) ||
      debit > BigInt(receipt.inAmount)
    )
      throw new Error("Confirmed debit exceeds the reviewed funding budget.");
    await recordCreatorVolume({
      basketId: receipt.basketId,
      signature,
      owner: taker,
      amountBaseUnits: debit.toString(),
      network: "mainnet-beta",
    });
  } catch {
    // An analytics store failure must not turn a confirmed purchase into a retryable trade error.
    console.warn("[creator-volume] confirmed receipt attribution unavailable");
  }
}
