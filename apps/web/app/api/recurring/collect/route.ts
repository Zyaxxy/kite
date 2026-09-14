import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import { collectDevnetRecurringPlan } from "@/lib/server/recurring-devnet";
import { parseCollectDevnetPlan } from "@/lib/server/recurring-devnet-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Preparation only. The caller funds transaction fees; it has no token authority. */
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const input = parseCollectDevnetPlan(await readLimitedJson(request, 2048));
    return NextResponse.json(await collectDevnetRecurringPlan(input), {
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare devnet collection.",
      },
      { status: 422, headers },
    );
  }
}
