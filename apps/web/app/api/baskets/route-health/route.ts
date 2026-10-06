import { after, NextRequest, NextResponse } from "next/server";
import type { BasketRouteHealthRequest } from "@kite/sdk";
import {
  getBasketRouteCoverage,
  getBasketRouteHealth,
  warmDefaultRouteHealth,
} from "@/lib/server/basket-route-health";
import {
  allowedOrigin,
  createRequestLimiter,
  readLimitedJson,
} from "@/lib/server/request-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const limit = createRequestLimiter(60);
let warming = false;
let nextWarmAt = 0;
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const baskets = await getBasketRouteCoverage();
  if (!warming && Date.now() >= nextWarmAt) {
    warming = true;
    nextWarmAt = Date.now() + 60_000;
    after(async () => {
      try {
        await warmDefaultRouteHealth();
      } catch {
        /* Observation remains unknown. */
      } finally {
        warming = false;
      }
    });
  }
  return NextResponse.json({ baskets }, { headers });
}

export async function POST(request: NextRequest) {
  if (
    !allowedOrigin(
      request.headers.get("origin"),
      request.nextUrl.origin,
      process.env.KITE_ALLOWED_ORIGINS ?? "",
      process.env.NODE_ENV !== "production",
    )
  )
    return NextResponse.json(
      { error: "Origin is not allowed." },
      { status: 403, headers },
    );
  // Process-wide cap supplements the distributed upstream-call budget.
  const retryAfter = limit("route-health");
  if (retryAfter)
    return NextResponse.json(
      { error: "Route checks are busy. Try again shortly." },
      {
        status: 429,
        headers: { ...headers, "Retry-After": String(retryAfter) },
      },
    );
  try {
    const input = (await readLimitedJson(
      request,
      4096,
    )) as BasketRouteHealthRequest;
    return NextResponse.json(await getBasketRouteHealth(input), { headers });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not check routes. Check your allocations, funding amount and slippage, or retry later.",
      },
      { status: 422, headers },
    );
  }
}
