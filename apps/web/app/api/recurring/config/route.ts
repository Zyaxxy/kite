import { NextResponse } from "next/server";
import { getDevnetRecurringConfig } from "@/lib/server/recurring-devnet";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  return NextResponse.json(await getDevnetRecurringConfig(), {
    headers: { "Cache-Control": "no-store" },
  });
}
