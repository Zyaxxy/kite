import { NextRequest, NextResponse } from "next/server";
import type { RecurringPaymentRequest } from "@kite/sdk";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  createRecurringPayment,
  listRecurringPayments,
} from "@/lib/server/recurring-payments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      {
        payments: await listRecurringPayments(
          request.nextUrl.searchParams.get("wallet") ?? "",
        ),
      },
      { headers },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to read permissions." },
      { status: 503, headers },
    );
  }
}
export async function POST(request: NextRequest) {
  try {
    const body = (await readLimitedJson(
      request,
      4096,
    )) as RecurringPaymentRequest;
    if (
      !body ||
      typeof body.taker !== "string" ||
      typeof body.buyer !== "string" ||
      typeof body.mint !== "string" ||
      typeof body.amount !== "string" ||
      body.amount.length > 40 ||
      !Number.isInteger(body.periodSeconds) ||
      !Number.isInteger(body.periods)
    )
      throw new Error("Invalid recurring payment terms.");
    return NextResponse.json(await createRecurringPayment(body), { headers });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Unable to prepare permission.",
      },
      { status: 422, headers },
    );
  }
}
