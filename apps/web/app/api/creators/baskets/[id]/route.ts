import { NextResponse } from "next/server";
import {
  CreatorServiceError,
  resolvePublishedCreatorBasket,
} from "@/lib/server/creator-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const basket = await resolvePublishedCreatorBasket((await params).id);
    return basket
      ? NextResponse.json(
          { basket },
          { headers: { "Cache-Control": "public, max-age=30" } },
        )
      : NextResponse.json(
          { error: "Published basket not found." },
          { status: 404 },
        );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CreatorServiceError
            ? error.message
            : "Creator basket temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}
