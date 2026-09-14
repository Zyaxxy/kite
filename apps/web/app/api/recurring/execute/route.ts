import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import { executeRecurringTransaction } from "@/lib/server/recurring-devnet-transport";
import { parseExecuteDevnetPlan } from "@/lib/server/recurring-devnet-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const input = parseExecuteDevnetPlan(
      await readLimitedJson(request, 12_288),
    );
    return NextResponse.json(await executeRecurringTransaction(input), {
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to submit the signed devnet transaction.",
      },
      { status: 422, headers },
    );
  }
}
