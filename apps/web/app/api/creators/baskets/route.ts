import { NextResponse } from "next/server";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  creatorPublishingConfigured,
  validateCreatorInvite,
  validateCreatorWallet,
  verifyCreatorApproval,
} from "@/lib/server/creator-auth";
import {
  claimCreatorNonce,
  CreatorServiceError,
  limitCreatorAttempts,
  listPublishedCreatorBaskets,
  publishCreatorBasket,
} from "@/lib/server/creator-store";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("wallet");
    const wallet = raw ? validateCreatorWallet(raw) : undefined;
    return NextResponse.json(
      {
        baskets: await listPublishedCreatorBaskets(wallet),
        publishingEnabled: creatorPublishingConfigured(),
      },
      { headers: { "Cache-Control": "private, max-age=15" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const body = (await readLimitedJson(request, 24_576)) as {
      token?: unknown;
      signature?: unknown;
      inviteCode?: unknown;
    } | null;
    const approval = verifyCreatorApproval(
      body?.token,
      body?.signature,
      siteUrl().origin,
    );
    await limitCreatorAttempts(approval.wallet);
    if (!validateCreatorInvite(body?.inviteCode))
      throw new CreatorServiceError(
        "That invite code is not valid. Check it and try again.",
        403,
      );
    await claimCreatorNonce(approval.nonce);
    await publishCreatorBasket(approval.basket);
    return NextResponse.json(
      { basket: approval.basket },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof CreatorServiceError
          ? error.message
          : "Could not load or publish creator baskets. Please retry.",
    },
    {
      status: error instanceof CreatorServiceError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
