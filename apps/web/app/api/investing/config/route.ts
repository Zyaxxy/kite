import { NextResponse } from "next/server";
import { investmentConfig } from "@/lib/server/investing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await investmentConfig(), {
    headers: { "Cache-Control": "no-store" },
  });
}
