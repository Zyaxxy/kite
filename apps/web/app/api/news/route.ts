import { NextRequest, NextResponse } from "next/server";

interface NewsArticle {
  title: string;
  source: string | null;
  link: string;
  pubDate: string | null;
  sentiment: "Bullish" | "Neutral" | "Bearish";
}

// Headline keyword inference only; these labels are not provider sentiment data.
const BULLISH_KEYWORDS = [
  "rise",
  "surges",
  "gain",
  "profit",
  "growth",
  "record",
  "high",
  "beat",
  "bullish",
  "demand",
  "outperform",
  "upgrade",
  "partner",
  "lead",
  "expands",
  "boost",
  "rally",
  "breakthrough",
  "approval",
  "dividend",
  "revenue",
  "accelerates",
];

const BEARISH_KEYWORDS = [
  "fall",
  "drop",
  "slump",
  "loss",
  "miss",
  "plunge",
  "decline",
  "bearish",
  "cut",
  "warning",
  "probe",
  "lawsuit",
  "downgrade",
  "delay",
  "risk",
  "inflation",
  "recession",
  "headwind",
  "scrutiny",
  "selloff",
  "deficit",
];

function analyzeHeadlineSentiment(title: string): {
  score: number;
  label: "Bullish" | "Neutral" | "Bearish";
} {
  const lower = title.toLowerCase();
  let bullCount = 0;
  let bearCount = 0;

  for (const w of BULLISH_KEYWORDS) {
    if (lower.includes(w)) bullCount++;
  }
  for (const w of BEARISH_KEYWORDS) {
    if (lower.includes(w)) bearCount++;
  }

  if (bullCount > bearCount)
    return { score: Math.min(1.0, 0.3 + bullCount * 0.2), label: "Bullish" };
  if (bearCount > bullCount)
    return { score: Math.max(-1.0, -0.3 - bearCount * 0.2), label: "Bearish" };
  return { score: 0, label: "Neutral" };
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
  const symbol = searchParams.get("symbol")?.trim() || "NVDA";
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

  const searchQuery =
    queryMap[cleanSymbol] ||
    `${cleanSymbol} stock OR Solana tokenized equities`;

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
        sentiment: analyzeHeadlineSentiment(title).label,
      });
    }

    const avgScore = items.length
      ? Number(
          (
            items.reduce(
              (sum, item) => sum + analyzeHeadlineSentiment(item.title).score,
              0,
            ) / items.length
          ).toFixed(2),
        )
      : null;
    const sentimentLabel =
      avgScore === null
        ? null
        : avgScore >= 0.5
          ? "Very Bullish"
          : avgScore > 0.15
            ? "Bullish"
            : avgScore > -0.15
              ? "Neutral"
              : avgScore > -0.5
                ? "Bearish"
                : "Very Bearish";

    return NextResponse.json({
      symbol,
      cleanSymbol,
      status: items.length ? "live" : "empty",
      sentimentScore: avgScore,
      sentimentLabel,
      sentimentMethod: items.length ? "headline-keywords" : null,
      aiSummary: null,
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
        sentimentScore: null,
        sentimentLabel: null,
        sentimentMethod: null,
        aiSummary: null,
        articles: [],
        fetchedAt: null,
        message: "News is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }
}
