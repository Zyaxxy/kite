import { NextRequest, NextResponse } from "next/server";
import type { CreateInvestmentPlanRequest } from "@kite/sdk";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  createInvestmentPlan,
  listInvestmentPlans,
} from "@/lib/server/investing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await listInvestmentPlans(
        request.nextUrl.searchParams.get("wallet") ?? "",
      ),
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Investment plans are temporarily unavailable. Check the service configuration and retry.",
      },
      { status: 503, headers },
    );
  }
}
export async function POST(request: NextRequest) {
  try {
    const input = (await readLimitedJson(
      request,
      4096,
    )) as CreateInvestmentPlanRequest;
    return NextResponse.json(await createInvestmentPlan(input), { headers });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Unable to prepare this investment.",
      },
      { status: 422, headers },
    );
  }
}
