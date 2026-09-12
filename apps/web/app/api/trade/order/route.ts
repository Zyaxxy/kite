import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  MAINNET_USDC_MINT,
  toTokenAmount,
  type MainnetTradeOrder,
} from "@kite/sdk";
import { getServerMarkets } from "@/lib/server/markets";
import { authorizeTrade } from "@/lib/server/trade-authorization";
import { getTradeMintDecimals } from "@/lib/server/mint-precision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      {
        error:
          "Actual trading is unavailable: this deployment needs a server-side Jupiter API key.",
      },
      { status: 503 },
    );
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object")
      throw new Error("Invalid trade request.");
    const { mint, amount, taker, side } = body as Record<string, unknown>;
    if (
      typeof mint !== "string" ||
      typeof amount !== "string" ||
      amount.length > 40 ||
      typeof taker !== "string" ||
      (side !== "buy" && side !== "sell")
    )
      throw new Error(
        "A token, amount, wallet and trade direction are required.",
      );
    if (!PublicKey.isOnCurve(new PublicKey(taker).toBytes()))
      throw new Error("A valid signing wallet is required.");
    const markets = await getServerMarkets();
    const asset = markets.assets.find(
      (item) => item.mint === mint && item.verified,
    );
    if (!asset)
      return NextResponse.json(
        {
          error:
            "This mint is not present in the available verified issuer catalogs.",
        },
        { status: 422 },
      );
    if (asset.tradingHalted)
      return NextResponse.json(
        { error: "The issuer has halted trading for this asset." },
        { status: 422 },
      );
    let decimals: number;
    try {
      decimals = await getTradeMintDecimals(mint);
    } catch {
      // Provider URLs can contain credentials, so do not log upstream error objects.
      console.warn("[api/trade/order] mainnet_mint_precision_unavailable", {
        mint,
      });
      return NextResponse.json(
        {
          error:
            "Token precision could not be read from Solana mainnet. Please retry or check the server RPC configuration.",
        },
        { status: 503 },
      );
    }
    const inputMint = side === "buy" ? MAINNET_USDC_MINT : mint;
    const outputMint = side === "buy" ? mint : MAINNET_USDC_MINT;
    const inputDecimals = side === "buy" ? 6 : decimals;
    const outputDecimals = side === "buy" ? decimals : 6;
    const rawAmount = toTokenAmount(amount, inputDecimals);
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: rawAmount,
      taker,
    });
    const response = await fetch(`https://api.jup.ag/swap/v2/order?${params}`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok)
      return NextResponse.json(
        { error: "Jupiter could not provide a live order. Try again shortly." },
        { status: 502 },
      );
    if (
      typeof data.transaction !== "string" ||
      !data.transaction ||
      typeof data.requestId !== "string"
    )
      return NextResponse.json(
        {
          error:
            typeof data.errorMessage === "string"
              ? data.errorMessage
              : "No executable route is available for this amount and wallet balance.",
        },
        { status: 422 },
      );
    if (
      data.inputMint !== inputMint ||
      data.outputMint !== outputMint ||
      data.inAmount !== rawAmount ||
      typeof data.outAmount !== "string" ||
      !/^\d+$/.test(data.outAmount) ||
      BigInt(data.outAmount) <= BigInt(0)
    )
      throw new Error("The returned quote does not match the requested trade.");
    if (
      typeof data.slippageBps !== "number" ||
      !Number.isFinite(data.slippageBps) ||
      data.slippageBps < 0 ||
      typeof data.feeBps !== "number" ||
      !Number.isFinite(data.feeBps)
    )
      throw new Error(
        "The route did not return its slippage and fee information.",
      );
    const upstreamExpiry =
      typeof data.expireAt === "string" ? Date.parse(data.expireAt) : NaN;
    const expiresAt = Math.min(
      Date.now() + 45_000,
      Number.isFinite(upstreamExpiry) ? upstreamExpiry : Infinity,
    );
    if (expiresAt <= Date.now())
      throw new Error("The provider quote expired. Request another quote.");
    const order: MainnetTradeOrder = {
      requestId: data.requestId,
      transaction: data.transaction,
      inputMint,
      outputMint,
      inAmount: rawAmount,
      outAmount: data.outAmount,
      ...(typeof data.otherAmountThreshold === "string" &&
      /^\d+$/.test(data.otherAmountThreshold)
        ? { otherAmountThreshold: data.otherAmountThreshold }
        : {}),
      slippageBps: data.slippageBps,
      feeBps: data.feeBps,
      feeMint: typeof data.feeMint === "string" ? data.feeMint : "",
      router: typeof data.router === "string" ? data.router : "Jupiter",
      priceImpactPct:
        typeof data.priceImpactPct === "number" ? data.priceImpactPct : null,
      expiresAt,
      authorization: authorizeTrade(
        data.transaction,
        data.requestId,
        taker,
        expiresAt,
        process.env.KITE_TRADE_SECRET || apiKey,
      ),
      taker,
      inputSymbol: side === "buy" ? "USDC" : asset.symbol,
      outputSymbol: side === "buy" ? asset.symbol : "USDC",
      inputDecimals,
      outputDecimals,
      side,
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
