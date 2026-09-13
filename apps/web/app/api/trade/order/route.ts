import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  MAINNET_USDC_MINT,
  BASE_SWAP_TOKENS,
  hasCompleteIssuerCatalogs,
  toTokenAmount,
  type MainnetTradeOrder,
  type SwapToken,
  type TradeSide,
} from "@kite/sdk";
import { getServerMarketCatalog } from "@/lib/server/markets";
import { prepareTokenSwapOrder } from "@/lib/server/basket-order";
import { assertMainnetV1Ready } from "@/lib/server/composed-transactions";
import { getTradeMintDecimals } from "@/lib/server/mint-precision";
import { searchJupiterSwapTokens } from "@/lib/server/swap-tokens";
import { readLimitedJson } from "@/lib/server/request-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const apiKey = process.env.JUPITER_API_KEY;
  const tradeSecret = process.env.KITE_TRADE_SECRET;
  if (!apiKey || !tradeSecret || tradeSecret.length < 32)
    return NextResponse.json(
      {
        error:
          "Actual trading is unavailable: this deployment needs a server-side Jupiter API key and trade authorization secret.",
      },
      { status: 503 },
    );
  try {
    const body: unknown = await readLimitedJson(request, 4_096);
    if (!body || typeof body !== "object")
      throw new Error("Invalid trade request.");
    const values = body as Record<string, unknown>;
    const { mint, amount, taker } = values;
    if (
      typeof amount !== "string" ||
      amount.length > 40 ||
      typeof taker !== "string"
    )
      throw new Error(
        "An input token, output token, amount and signing wallet are required.",
      );
    // Existing buy/sell clients remain valid. New clients can choose either side freely.
    const legacy =
      values.inputMint === undefined && values.outputMint === undefined;
    let inputMint: string;
    let outputMint: string;
    let side: TradeSide = "swap";
    if (legacy) {
      if (
        typeof mint !== "string" ||
        (values.side !== "buy" && values.side !== "sell")
      )
        throw new Error("A token and buy or sell direction are required.");
      side = values.side;
      inputMint = side === "buy" ? MAINNET_USDC_MINT : mint;
      outputMint = side === "buy" ? mint : MAINNET_USDC_MINT;
    } else {
      if (
        typeof values.inputMint !== "string" ||
        typeof values.outputMint !== "string"
      )
        throw new Error("Choose both an input and output token.");
      inputMint = values.inputMint;
      outputMint = values.outputMint;
    }
    inputMint = new PublicKey(inputMint).toBase58();
    outputMint = new PublicKey(outputMint).toBase58();
    if (inputMint === outputMint)
      throw new Error("Choose two different tokens to swap.");
    if (!PublicKey.isOnCurve(new PublicKey(taker).toBytes()))
      throw new Error("A valid signing wallet is required.");
    const supportedTransactionVersions = Array.isArray(
      values.supportedTransactionVersions,
    )
      ? values.supportedTransactionVersions.filter(
          (v): v is number => typeof v === "number",
        )
      : [];
    await assertMainnetV1Ready(supportedTransactionVersions);
    const markets = await getServerMarketCatalog();
    const mints = [inputMint, outputMint];
    const issuerAssets = mints.map((address) =>
      markets.assets.find((asset) => asset.mint === address),
    );
    if (issuerAssets.some((asset) => asset?.tradingHalted))
      return NextResponse.json(
        { error: "The issuer has halted trading for this asset." },
        { status: 422 },
      );
    if (
      !hasCompleteIssuerCatalogs(markets) &&
      mints.some(
        (address) => !BASE_SWAP_TOKENS.some((token) => token.mint === address),
      )
    )
      return NextResponse.json(
        {
          error:
            "Issuer trading status is temporarily unavailable. Try again once the catalogs recover.",
        },
        { status: 503 },
      );
    const known = mints.map((address, index): SwapToken | undefined => {
      const issuer = issuerAssets[index];
      return issuer && issuer.verified
        ? { ...issuer, source: "issuer" }
        : BASE_SWAP_TOKENS.find((token) => token.mint === address);
    });
    const missingMints = mints.filter((_, index) => !known[index]);
    if (missingMints.length) {
      let discovered: SwapToken[];
      try {
        discovered = await searchJupiterSwapTokens(missingMints.join(","));
      } catch {
        return NextResponse.json(
          {
            error:
              "Token metadata is temporarily unavailable. Please retry the search.",
          },
          { status: 503 },
        );
      }
      for (let index = 0; index < known.length; index++)
        known[index] ??= discovered.find(
          (token) => token.mint === mints[index],
        );
    }
    const [inputToken, outputToken] = known;
    if (!inputToken || !outputToken)
      return NextResponse.json(
        {
          error:
            "This token could not be found in the mainnet token index. Check its mint address.",
        },
        { status: 422 },
      );
    let inputDecimals: number;
    let outputDecimals: number;
    try {
      [inputDecimals, outputDecimals] = await Promise.all(
        mints.map(getTradeMintDecimals),
      );
    } catch {
      // Provider URLs can contain credentials, so do not log upstream error objects.
      console.warn("[api/trade/order] mainnet_mint_precision_unavailable", {
        inputMint,
        outputMint,
      });
      return NextResponse.json(
        {
          error:
            "Token precision could not be read from Solana mainnet. Please retry or check the server RPC configuration.",
        },
        { status: 503 },
      );
    }
    const rawAmount = toTokenAmount(amount, inputDecimals);
    const prepared = await prepareTokenSwapOrder(
      {
        inputMint,
        amount,
        taker,
        slippageBps: 100,
        supportedTransactionVersions,
      },
      outputToken,
    );
    const output = prepared.outputs[0];
    const order: MainnetTradeOrder = {
      requestId: prepared.requestId,
      transaction: prepared.transaction,
      transactionVersion: prepared.transactionVersion,
      serializedBytes: prepared.serializedBytes,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
      inputMint,
      outputMint,
      inAmount: rawAmount,
      outAmount: output.outAmount,
      otherAmountThreshold: output.minimumAmount,
      slippageBps: prepared.slippageBps,
      feeBps: 0,
      feeMint: inputMint,
      router: "Jupiter",
      priceImpactPct: null,
      expiresAt: prepared.expiresAt,
      authorization: prepared.authorization,
      taker,
      inputSymbol: inputToken.symbol,
      outputSymbol: outputToken.symbol,
      inputDecimals,
      outputDecimals,
      side,
      simulation: {
        status: "passed",
        simulatedAt: new Date().toISOString(),
        unitsConsumed: null,
      },
    };
    return NextResponse.json(order, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to prepare this trade.",
      },
      { status: 400 },
    );
  }
}
