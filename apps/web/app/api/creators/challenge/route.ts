import { NextResponse } from "next/server";
import { MAX_CUSTOM_BASKET_LEGS, validateProgrammableBasket } from "@kite/sdk";
import { getServerMarketCatalog } from "@/lib/server/markets";
import { readLimitedJson } from "@/lib/server/request-policy";
import {
  creatorPublishingConfigured,
  prepareCreatorApproval,
  validateCreatorWallet,
} from "@/lib/server/creator-auth";
import { CreatorServiceError } from "@/lib/server/creator-store";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!creatorPublishingConfigured())
      throw new CreatorServiceError(
        "Creator publishing is invite-only and not configured on this deployment.",
      );
    const body = (await readLimitedJson(request, 16_384)) as {
      wallet?: unknown;
      basket?: unknown;
    } | null;
    const wallet = validateCreatorWallet(body?.wallet);
    let basket;
    try {
      basket = validateProgrammableBasket(body?.basket);
    } catch {
      throw new CreatorServiceError(
        `Choose 2–${MAX_CUSTOM_BASKET_LEGS} assets with positive weights totaling 100%, and complete the basket details.`,
        400,
      );
    }
    const catalog = await getServerMarketCatalog();
    basket.allocations = basket.allocations.map((allocation) => {
      const asset = catalog.assets.find(
        (a) => a.mint === allocation.mint && a.verified && !a.tradingHalted,
      );
      if (!asset)
        throw new CreatorServiceError(
          "Every published asset must be available in the verified issuer catalog. Refresh and review again.",
          422,
        );
      return {
        ...allocation,
        symbol: asset.underlyingSymbol || asset.symbol,
        name: asset.name,
      };
    });
    const approval = prepareCreatorApproval(basket, wallet, siteUrl().origin);
    return NextResponse.json(approval, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CreatorServiceError
            ? error.message
            : "Could not prepare publishing. Please retry.",
      },
      { status: error instanceof CreatorServiceError ? error.status : 503 },
    );
  }
}
