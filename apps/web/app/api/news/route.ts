import { NextRequest, NextResponse } from "next/server";

interface NewsArticle {
  title: string;
  source: string | null;
  link: string;
  pubDate: string | null;
}

function readXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_, entity: string) =>
        ({
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
        })[entity] ?? "",
    )
    .trim();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const marketScope = searchParams.get("scope") === "market";
  const symbol = marketScope
    ? "MARKET"
    : searchParams.get("symbol")?.trim() || "NVDA";
  // Issuer wrappers use lowercase x; preserve company names such as XAI and SPACEX.
  const cleanSymbol = symbol
    .replace(/^pre/i, "")
    .replace(/^x/, "")
    .replace(/x$/, "")
    .toUpperCase();

  const queryMap: Record<string, string> = {
    NVDA: "Nvidia stock OR Nvidia Blackwell AI",
    AAPL: "Apple stock OR iPhone AI",
    MSFT: "Microsoft stock OR Azure AI",
    TSLA: "Tesla stock OR Tesla Robotaxi",
    AMZN: "Amazon stock OR AWS Cloud",
    GOOGL: "Alphabet Google stock OR Gemini AI",
    META: "Meta stock OR Llama AI",
    OPENAI: "OpenAI AI funding valuation",
    SPACEX: "SpaceX Starship valuation launch",
    STRIPE: "Stripe valuation fintech payments",
  };

  const searchQuery = marketScope
    ? "(US stock market OR tokenized stocks OR xStocks) when:7d"
    : queryMap[cleanSymbol] || `${cleanSymbol} stock`;

  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(rssUrl, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Kite/1.0" },
    });
    if (!response.ok) throw new Error("News provider is unavailable.");

    const xml = await response.text();
    if (!/<rss\b/i.test(xml))
      throw new Error("News provider returned an invalid feed.");

    const items: NewsArticle[] = [];
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

    for (const itemXml of itemMatches.slice(0, 6)) {
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      const source = sourceMatch ? readXmlText(sourceMatch[1]) || null : null;
      let title = titleMatch ? readXmlText(titleMatch[1]) : "";
      if (source && title.endsWith(` - ${source}`))
        title = title.slice(0, -(source.length + 3)).trim();
      const link = linkMatch ? readXmlText(linkMatch[1]) : "";
      // Missing or unusable articles are skipped instead of inventing a title or URL.
      if (!title || !/^https?:\/\//i.test(link)) continue;
      const published = pubDateMatch
        ? new Date(readXmlText(pubDateMatch[1]))
        : null;
      const pubDate =
        published && Number.isFinite(published.getTime())
          ? published.toISOString()
          : null;
      items.push({
        title,
        source,
        link,
        pubDate,
      });
    }

    return NextResponse.json({
      symbol,
      cleanSymbol,
      status: items.length ? "live" : "empty",
      articles: items,
      fetchedAt: new Date().toISOString(),
      message: items.length
        ? null
        : "No matching articles were returned by the news provider.",
    });
  } catch {
    return NextResponse.json(
      {
        symbol,
        cleanSymbol,
        status: "unavailable",
        articles: [],
        fetchedAt: null,
        message: "News is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }
}
