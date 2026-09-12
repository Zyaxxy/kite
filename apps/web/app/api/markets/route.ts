import { createHash } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { getServerMarkets } from "@/lib/server/markets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const snapshot = await getServerMarkets({
      waitUntil: (task) => after(() => task),
    });
    const body = JSON.stringify(snapshot);
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    const headers = { "Cache-Control": "private, no-cache", ETag: etag };
    if (
      snapshot.status !== "unavailable" &&
      request.headers.get("if-none-match") === etag
    )
      return new NextResponse(null, { status: 304, headers });
    return new NextResponse(body, {
      status: snapshot.status === "unavailable" ? 503 : 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      {
        assets: [],
        baskets: [],
        asOf: new Date().toISOString(),
        network: "mainnet-beta",
        sources: [],
        status: "unavailable",
        warnings: ["Market data is temporarily unavailable. Please try again."],
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
