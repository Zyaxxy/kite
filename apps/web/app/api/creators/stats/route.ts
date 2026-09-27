import { NextResponse } from "next/server";
import { validateCreatorWallet } from "@/lib/server/creator-auth";
import {
  CreatorServiceError,
  getCreatorStats,
  listCreatorSubscriptions,
  withinCreatorStatsDeadline,
} from "@/lib/server/creator-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const wallet = validateCreatorWallet(
      new URL(request.url).searchParams.get("wallet"),
    );
    const stats = await withinCreatorStatsDeadline(async () => {
      const subscriptions = await listCreatorSubscriptions(wallet);
      const { reconcileCreatorSubscriptions } =
        await import("@/lib/server/recurring-devnet");
      const verified = await reconcileCreatorSubscriptions(subscriptions);
      // Use this verified snapshot; a second storage read could include newly added, unchecked plans.
      return getCreatorStats(wallet, verified);
    });
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "private, max-age=15" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CreatorServiceError
            ? error.message
            : "Creator activity is temporarily unavailable.",
      },
      { status: error instanceof CreatorServiceError ? error.status : 503 },
    );
  }
}
