import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  assertExecutorCredential,
  dueInvestments,
  prepareInvestmentRun,
  recordInvestmentRun,
  reconcileInvestmentRun,
  discardInvestmentRun,
} from "@/lib/server/investing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
function authenticated(request: NextRequest) {
  try {
    assertExecutorCredential(request.headers.get("authorization"));
    return true;
  } catch {
    return false;
  }
}
export async function GET(request: NextRequest) {
  if (!authenticated(request))
    return NextResponse.json(
      { error: "Executor authentication required." },
      { status: 401, headers },
    );
  try {
    return NextResponse.json(await dueInvestments(), { headers });
  } catch {
    return NextResponse.json(
      {
        error:
          "The investment ledger needs attention or the RPC is unavailable. No new order was submitted.",
      },
      { status: 503, headers },
    );
  }
}
export async function POST(request: NextRequest) {
  if (!authenticated(request))
    return NextResponse.json(
      { error: "Executor authentication required." },
      { status: 401, headers },
    );
  try {
    const body = (await readLimitedJson(request, 16384)) as Record<
      string,
      unknown
    >;
    if (
      !body ||
      typeof body.planId !== "string" ||
      !/^[a-f0-9]{32}$/.test(body.planId) ||
      typeof body.runId !== "string" ||
      !new RegExp(`^${body.planId}:[0-9]{1,3}$`).test(body.runId)
    )
      throw new Error("Invalid investment occurrence.");
    if (body.action === "prepare")
      return NextResponse.json(
        await prepareInvestmentRun(body.planId, body.runId),
        { headers },
      );
    if (body.action === "reconcile")
      return NextResponse.json(
        await reconcileInvestmentRun(body.planId, body.runId),
        { headers },
      );
    if (
      body.action === "discard" &&
      typeof body.authorization === "string" &&
      body.authorization.length <= 4000
    )
      return NextResponse.json(
        await discardInvestmentRun(body.planId, body.runId, body.authorization),
        { headers },
      );
    if (
      body.action !== "record" ||
      typeof body.signedTransaction !== "string" ||
      body.signedTransaction.length > 8000 ||
      typeof body.authorization !== "string" ||
      body.authorization.length > 4000
    )
      throw new Error("A reviewed and signed investment is required.");
    return NextResponse.json(
      await recordInvestmentRun(
        body.planId,
        body.runId,
        body.signedTransaction,
        body.authorization,
      ),
      { headers },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Investment execution needs reconciliation.",
      },
      { status: 422, headers },
    );
  }
}
