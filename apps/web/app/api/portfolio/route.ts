import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getWalletPortfolio } from "@/lib/server/holdings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("wallet");
  if (!address)
    return NextResponse.json(
      { error: "A wallet address is required." },
      { status: 400 },
    );
  try {
    if (new PublicKey(address).toBase58() !== address) throw new Error();
  } catch {
    return NextResponse.json(
      { error: "Invalid wallet address." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await getWalletPortfolio(address), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    // Never send provider errors (which may contain credential-bearing RPC URLs).
    return NextResponse.json(
      {
        error:
          "Mainnet wallet balances could not be verified. Refresh or configure a dedicated Solana mainnet RPC.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
