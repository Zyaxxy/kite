import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import { closeDevnetRecurringPlan } from "@/lib/server/recurring-devnet";
import { parseCloseDevnetPlan } from "@/lib/server/recurring-devnet-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const input = parseCloseDevnetPlan(await readLimitedJson(request, 2048));
    return NextResponse.json(await closeDevnetRecurringPlan(input), {
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare devnet revocation.",
      },
      { status: 422, headers },
    );
  }
}
