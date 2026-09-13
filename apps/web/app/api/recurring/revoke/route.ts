import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import { revokeRecurringPayment } from "@/lib/server/recurring-payments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const b = (await readLimitedJson(request, 2048)) as {
      taker: string;
      delegation: string;
    };
    if (!b || typeof b.taker !== "string" || typeof b.delegation !== "string")
      throw new Error("Choose a wallet and delegation address.");
    return NextResponse.json(
      await revokeRecurringPayment(b.taker, b.delegation),
      { headers },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Unable to prepare transaction.",
      },
      { status: 422, headers },
    );
  }
}
