import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  collectDevnetRecurringPlan,
  runDevnetCollectorPass,
} from "@/lib/server/recurring-devnet";
import { parseCollectDevnetPlan } from "@/lib/server/recurring-devnet-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Trigger automated collection pass across all due recurring plans (used by cronjob.org). */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const summary = await runDevnetCollectorPass();
    return NextResponse.json(
      {
        status: "ok",
        ...summary,
      },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to run recurring collection pass.",
      },
      { status: 500, headers },
    );
  }
}

/** Preparation only. The caller funds transaction fees; it has no token authority. */
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const raw = await readLimitedJson(request, 2048).catch(() => null);
    if (!raw || Object.keys(raw).length === 0 || (raw as any).trigger === "cron") {
      const summary = await runDevnetCollectorPass();
      return NextResponse.json({ status: "ok", ...summary }, { headers });
    }
    const input = parseCollectDevnetPlan(raw);
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

