import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import { getFaucetStatus, requestDevnetFunds } from "@/lib/server/faucet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  return NextResponse.json(getFaucetStatus(), { headers });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await readLimitedJson(request, 4096)) as Record<string, unknown>;
    const recipient = String(body.recipient || body.wallet || "").trim();

    if (!recipient) {
      return NextResponse.json(
        { error: "A recipient wallet address is required." },
        { status: 400, headers },
      );
    }

    const requestedAmount =
      typeof body.amount === "number" && body.amount > 0 && body.amount <= 1000
        ? body.amount
        : 500;

    const result = await requestDevnetFunds(recipient, requestedAmount);
    return NextResponse.json(result, { headers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Devnet faucet request failed.";
    return NextResponse.json({ error: message }, { status: 422, headers });
  }
}
