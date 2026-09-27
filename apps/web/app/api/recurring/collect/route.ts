import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  collectDevnetRecurringPlan,
  runDevnetCollectorPass,
} from "@/lib/server/recurring-devnet";
import { parseCollectDevnetPlan } from "@/lib/server/recurring-devnet-policy";
import {
  KeeperError,
  requireCollectorAuthorization,
} from "@/lib/server/recurring-keeper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Trigger automated collection pass across all due recurring plans (used by cronjob.org). */
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    requireCollectorAuthorization(request.headers.get("authorization"));
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
      { status: error instanceof KeeperError ? error.status : 503, headers },
    );
  }
}

/** Preparation only. The caller funds transaction fees; it has no token authority. */
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    requireCollectorAuthorization(request.headers.get("authorization"));
    const raw = await readLimitedJson(request, 2048);
    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      (Object.keys(raw).length === 0 ||
        (Object.keys(raw).length === 1 &&
          "trigger" in raw &&
          raw.trigger === "cron"))
    ) {
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
      { status: error instanceof KeeperError ? error.status : 422, headers },
    );
  }
}
