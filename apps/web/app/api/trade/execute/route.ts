import { NextRequest, NextResponse } from "next/server";
import { classifyTradeExecution, UNKNOWN_TRADE_MESSAGE } from "@kite/sdk";
import { verifyTradeAuthorization } from "@/lib/server/trade-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      {
        status: "Failed",
        error:
          "Actual trading is not configured on this deployment. The transaction was not submitted.",
      },
      { status: 503 },
    );
  let executionAttempted = false;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.signedTransaction !== "string" ||
      body.signedTransaction.length > 8_000 ||
      typeof body.authorization !== "string" ||
      body.authorization.length > 4_000
    )
      throw new Error(
        "A reviewed order and its wallet-signed transaction are required.",
      );
    const authorization = verifyTradeAuthorization(
      body.authorization,
      body.signedTransaction,
      process.env.KITE_TRADE_SECRET || apiKey,
    );
    executionAttempted = true;
    const response = await fetch("https://api.jup.ag/swap/v2/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        requestId: authorization.requestId,
        signedTransaction: body.signedTransaction,
      }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    const result = response.ok
      ? classifyTradeExecution(data)
      : { status: "Unknown" as const, error: UNKNOWN_TRADE_MESSAGE };
    return NextResponse.json(result, {
      status:
        result.status === "Success"
          ? 200
          : result.status === "Failed"
            ? 422
            : 502,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    if (executionAttempted)
      return NextResponse.json(
        { status: "Unknown", error: UNKNOWN_TRADE_MESSAGE },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    return NextResponse.json(
      {
        status: "Failed",
        error:
          cause instanceof Error
            ? cause.message
            : "Unable to confirm the trade. Check your wallet activity before trying again.",
      },
      { status: 400 },
    );
  }
}
