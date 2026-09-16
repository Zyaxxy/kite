import { NextRequest, NextResponse } from "next/server";
import { BASE_SWAP_TOKENS, type SwapToken } from "@kite/sdk";
import { getServerMarketCatalog } from "@/lib/server/markets";
import { searchJupiterSwapTokens } from "@/lib/server/swap-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("query") || "").trim();
  if (query.length > 100)
    return NextResponse.json(
      { error: "Search by token name, symbol or one mint address." },
      { status: 400 },
    );
  const [markets, discovery] = await Promise.allSettled([
    getServerMarketCatalog(),
    searchJupiterSwapTokens(
      query || BASE_SWAP_TOKENS.map((token) => token.mint).join(","),
    ),
  ]);
  const matches = (token: SwapToken) =>
    !query ||
    `${token.symbol} ${token.name} ${token.mint}`
      .toLowerCase()
      .includes(query.toLowerCase());
  const results = new Map<string, SwapToken>();
  for (const token of BASE_SWAP_TOKENS.filter(matches))
    results.set(token.mint, token);
  if (discovery.status === "fulfilled")
    for (const token of discovery.value) results.set(token.mint, token);
  if (markets.status === "fulfilled") {
    for (const asset of markets.value.assets) {
      const token: SwapToken = { ...asset, source: "issuer" };
      if (matches(token) || results.has(token.mint))
        results.set(token.mint, token);
    }
    // An index result cannot override a known discovery-only Backpack listing.
    for (const security of markets.value.backpackSecurities ?? []) {
      if (!security.discoveryOnly) continue;
      for (const mint of security.candidateSolanaMints ?? [
        security.solanaMint,
      ]) {
        if (!mint) continue;
        const indexed = results.get(mint);
        if (indexed)
          results.set(mint, {
            ...indexed,
            symbol: security.symbol,
            name: security.name,
            decimals: security.decimals,
            source: "issuer",
            priceUsd: null,
            tradingHalted: true,
          });
      }
    }
  }
  const tokens = [...results.values()].sort((a, b) => {
    const rank = (token: SwapToken) =>
      BASE_SWAP_TOKENS.some((base) => base.mint === token.mint)
        ? 0
        : token.source === "issuer"
          ? 1
          : token.verified
            ? 2
            : 3;
    return rank(a) - rank(b) || a.symbol.localeCompare(b.symbol);
  });
  return NextResponse.json(
    {
      tokens: tokens.slice(0, 80),
      total: tokens.length,
      warning:
        discovery.status === "rejected"
          ? "Token search is temporarily limited to the issuer catalog and base currencies."
          : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
