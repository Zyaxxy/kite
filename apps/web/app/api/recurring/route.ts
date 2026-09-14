import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  createDevnetRecurringPlan,
  listDevnetRecurringPlans,
} from "@/lib/server/recurring-devnet";
import {
  parseCreateDevnetPlan,
  parseDevnetWallet,
} from "@/lib/server/recurring-devnet-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  try {
    const wallet = parseDevnetWallet(
      request.nextUrl.searchParams.get("wallet"),
    );
    return NextResponse.json(
      {
        schemaVersion: 1,
        network: "devnet",
        plans: await listDevnetRecurringPlans(wallet),
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read devnet plans.",
      },
      { status: 503, headers },
    );
  }
}
export async function POST(request: NextRequest) {
  try {
    const input = parseCreateDevnetPlan(await readLimitedJson(request, 4096));
    return NextResponse.json(await createDevnetRecurringPlan(input), {
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare devnet plan.",
      },
      { status: 422, headers },
    );
  }
}
