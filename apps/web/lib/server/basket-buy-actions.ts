import { PublicKey } from "@solana/web3.js";
import type { ActionGetResponse } from "@solana/actions";
import {
  MAINNET_USDC_MINT,
  resolveCanonicalBasket,
  toTokenAmount,
  type BasketOrderRequest,
} from "@kite/sdk";
import { resolvePublishedCreatorBasket } from "./creator-store";

export async function resolveBuyActionBasket(id: string) {
  if (!/^[a-zA-Z0-9-]{1,40}$/.test(id))
    throw new Error("Select a published or curated basket.");
  return id.startsWith("creator-")
    ? resolvePublishedCreatorBasket(id)
    : resolveCanonicalBasket(id);
}

export function parseBasketBuyAction(
  id: string,
  search: URLSearchParams,
  body: unknown,
): BasketOrderRequest {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !["account", "data"].includes(key))
  )
    throw new Error("Provide the wallet account buying this basket.");
  const input = body as { account?: unknown; data?: unknown };
  if (
    input.data !== undefined &&
    (!input.data ||
      typeof input.data !== "object" ||
      Array.isArray(input.data) ||
      Object.keys(input.data).length)
  )
    throw new Error("Unexpected purchase parameters.");
  for (const key of search.keys()) {
    if (key !== "amount" || search.getAll(key).length !== 1)
      throw new Error("Unexpected or duplicate purchase parameter.");
  }
  if (typeof input.account !== "string")
    throw new Error("Provide a signing wallet.");
  const owner = new PublicKey(input.account);
  if (!PublicKey.isOnCurve(owner.toBytes()))
    throw new Error("Provide a signing wallet.");
  const amount = search.get("amount");
  if (!amount || amount.length > 40 || !/^\d+(?:\.\d{1,6})?$/.test(amount))
    throw new Error("Choose a USDC amount with at most six decimal places.");
  const units = BigInt(toTokenAmount(amount, 6));
  if (units <= BigInt(0) || units >= BigInt(2) ** BigInt(64))
    throw new Error("Choose a positive USDC amount within token limits.");
  return {
    basketId: id,
    taker: owner.toBase58(),
    inputMint: MAINNET_USDC_MINT,
    amount,
    slippageBps: 100,
    supportedTransactionVersions: [0],
  };
}

export function basketBuyActionMetadata(
  basket: { id: string; name: string },
  origin: string,
): ActionGetResponse {
  return {
    type: "action",
    icon: `${origin}/icon.svg`,
    title: `Buy ${basket.name} · Mainnet`,
    description:
      "Buy this basket once with mainnet USDC. Constituent tokens settle to your wallet. Maximum slippage is 1%; SOL is required for fees and account rent. Availability depends on live routes. If the complete basket needs multiple transactions, open Kite to review the purchase.",
    label: "Buy basket",
    disabled: false,
    links: {
      actions: [
        {
          type: "transaction",
          label: "Buy basket with USDC",
          href: `${origin}/api/actions/buy-baskets/${encodeURIComponent(basket.id)}?amount={amount}`,
          parameters: [
            {
              name: "amount",
              label: "USDC to invest",
              type: "number",
              required: true,
              min: 0.000001,
            },
          ],
        },
      ],
    },
  };
}
