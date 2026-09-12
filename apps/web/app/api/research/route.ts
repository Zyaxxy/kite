import { after, NextRequest, NextResponse } from "next/server";
import { getStockResearch } from "@kite/sdk";
import { getServerMarketCatalog } from "@/lib/server/markets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const mint = request.nextUrl.searchParams.get("mint")?.trim() ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
    return NextResponse.json(
      { error: "Select a valid market asset." },
      { status: 400 },
    );
  }
  try {
    const markets = await getServerMarketCatalog();
    const asset = markets.assets.find((item) => item.mint === mint);
    if (!asset)
      return NextResponse.json(
        { error: "This asset is not in the issuer market catalog." },
        { status: markets.status === "unavailable" ? 503 : 404 },
      );
    const research = await getStockResearch(asset, {
      waitUntil: (task) => after(() => task),
    });
    return NextResponse.json(research, {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch {
    return NextResponse.json(
      { error: "Company research is temporarily unavailable. Please retry." },
      { status: 503 },
    );
  }
}
