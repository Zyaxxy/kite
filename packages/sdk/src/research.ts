import type { MarketAsset } from "./markets";

/** Underlying-company research is separate from the price of its Solana token. */
export interface ResearchBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface ResearchProfile {
  name: string;
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  sourceUrl: string;
  observedAt: string;
}

export interface ResearchTechnicals {
  asOf: string;
  close: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  high52w: number | null;
  low52w: number | null;
  averageVolume20: number | null;
  trend: "above-50-day" | "below-50-day" | "at-50-day" | "unavailable";
  basis: "underlying-daily-close";
  sourceUrl: string;
}

export interface ResearchFundamental {
  id: string;
  label: string;
  value: number;
  unit: string;
  periodEnd: string;
  period: "annual" | "quarterly";
  sourceUrl: string;
}

export interface ResearchEvent {
  id: string;
  type: "dividend" | "split" | "filing";
  title: string;
  date: string;
  detail: string;
  sourceUrl: string;
}

export interface ResearchNews {
  title: string;
  publisher: string | null;
  url: string;
  publishedAt: string | null;
}

export interface StockResearch {
  mint: string;
  symbol: string;
  asOf: string;
  status: "available" | "partial" | "unavailable";
  profile: ResearchProfile | null;
  bars: ResearchBar[];
  technicals: ResearchTechnicals | null;
  fundamentals: ResearchFundamental[];
  events: ResearchEvent[];
  news: ResearchNews[];
  sources: Array<{ name: string; url: string }>;
  warnings: string[];
}

export interface ResearchOptions {
  fetcher?: typeof fetch;
  now?: () => number;
}

type ResearchAsset = Pick<
  MarketAsset,
  "mint" | "underlyingSymbol" | "name" | "kind" | "issuer"
>;
type Row = Record<string, unknown>;
const row = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const positive = (value: unknown): number | null => {
  const n = finite(value);
  return n !== null && n > 0 ? n : null;
};
const safeUrl = (value: unknown): string | null => {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};
const dateFromSeconds = (value: unknown): string | null => {
  const seconds = finite(value);
  if (seconds === null || seconds <= 0 || seconds > 8.64e12) return null;
  return new Date(seconds * 1000).toISOString();
};

async function request(
  url: string,
  options: ResearchOptions,
  format: "json" | "text" = "json",
): Promise<unknown> {
  const response = await (options.fetcher ?? fetch)(url, {
    headers: {
      Accept:
        format === "json"
          ? "application/json"
          : "application/rss+xml, application/xml",
      "User-Agent": "Kite Research (https://github.com/Zyaxxy/kite)",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok)
    throw new Error(`Research provider returned HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 2_000_000)
    throw new Error("Research response exceeded its size limit");
  return format === "json" ? (JSON.parse(body) as unknown) : body;
}

function parseBars(chart: Row, now: number): ResearchBar[] {
  const meta = row(chart.meta);
  const regular = row(row(meta.currentTradingPeriod).regular);
  const sessionStart = positive(regular.start);
  const sessionEnd = positive(regular.end);
  const knownSession =
    sessionStart !== null &&
    sessionEnd !== null &&
    sessionEnd <= 8.64e12 &&
    sessionEnd > sessionStart &&
    sessionEnd - sessionStart <= 48 * 60 * 60;
  let dayFormatter: Intl.DateTimeFormat;
  try {
    dayFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: text(meta.exchangeTimezoneName) || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    dayFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  const today = dayFormatter.format(now);
  const sessionDate = knownSession
    ? dayFormatter.format(sessionStart * 1000)
    : null;
  const quote = row(list(row(chart.indicators).quote)[0]);
  const [opens, highs, lows, closes, volumes] = [
    "open",
    "high",
    "low",
    "close",
    "volume",
  ].map((key) => list(quote[key]));
  const byDate = new Map<string, ResearchBar>();
  list(chart.timestamp)
    .slice(-400)
    .forEach((timestamp, offset, timestamps) => {
      const index = list(chart.timestamp).length - timestamps.length + offset;
      const date = dateFromSeconds(timestamp);
      const open = positive(opens[index]),
        high = positive(highs[index]),
        low = positive(lows[index]),
        close = positive(closes[index]);
      const volume = finite(volumes[index]);
      if (
        !date ||
        Date.parse(date) > now + 60_000 ||
        open === null ||
        high === null ||
        low === null ||
        close === null
      )
        return;
      const barDay = dayFormatter.format(Date.parse(date));
      // Daily chart responses include an unfinished current-session candle.
      // Only use it as a close once the reported regular session has ended.
      if (knownSession && barDay === sessionDate) {
        if (now < sessionEnd * 1000) return;
      } else if (barDay === today) {
        // Without matching session metadata, today's completion is unverified.
        return;
      }
      if (high < Math.max(open, close, low) || low > Math.min(open, close))
        return;
      byDate.set(date, {
        date,
        open,
        high,
        low,
        close,
        volume: volume !== null && volume >= 0 ? volume : null,
      });
    });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Wilder RSI and simple moving averages from observed daily bars; no synthetic points. */
export function calculateResearchTechnicals(
  bars: ResearchBar[],
  sourceUrl: string,
): ResearchTechnicals | null {
  if (!bars.length) return null;
  const closes = bars.map((bar) => bar.close);
  const average = (period: number): number | null =>
    closes.length < period
      ? null
      : closes.slice(-period).reduce((sum, value) => sum + value, 0) / period;
  let rsi14: number | null = null;
  if (closes.length >= 15) {
    let gain = 0,
      loss = 0;
    for (let index = 1; index <= 14; index++) {
      const change = closes[index] - closes[index - 1];
      gain += Math.max(change, 0) / 14;
      loss += Math.max(-change, 0) / 14;
    }
    for (let index = 15; index < closes.length; index++) {
      const change = closes[index] - closes[index - 1];
      gain = (gain * 13 + Math.max(change, 0)) / 14;
      loss = (loss * 13 + Math.max(-change, 0)) / 14;
    }
    rsi14 =
      gain === 0 && loss === 0
        ? 50
        : loss === 0
          ? 100
          : 100 - 100 / (1 + gain / loss);
  }
  const latest = bars[bars.length - 1];
  const sma50 = average(50);
  const volumes = bars.slice(-20).map((bar) => bar.volume);
  const cutoff = Date.parse(latest.date) - 365.25 * 24 * 60 * 60 * 1000;
  const yearBars = bars.filter((bar) => Date.parse(bar.date) >= cutoff);
  const hasYearCoverage =
    yearBars.length >= 200 &&
    Date.parse(latest.date) - Date.parse(yearBars[0].date) >=
      360 * 24 * 60 * 60 * 1000;
  return {
    asOf: latest.date,
    close: latest.close,
    sma20: average(20),
    sma50,
    sma200: average(200),
    rsi14,
    high52w: hasYearCoverage
      ? Math.max(...yearBars.map((bar) => bar.high))
      : null,
    low52w: hasYearCoverage
      ? Math.min(...yearBars.map((bar) => bar.low))
      : null,
    averageVolume20:
      volumes.length === 20 && volumes.every((volume) => volume !== null)
        ? volumes.reduce<number>((sum, volume) => sum + (volume ?? 0), 0) / 20
        : null,
    trend:
      sma50 === null
        ? "unavailable"
        : latest.close > sma50
          ? "above-50-day"
          : latest.close < sma50
            ? "below-50-day"
            : "at-50-day",
    basis: "underlying-daily-close",
    sourceUrl,
  };
}

const FUNDAMENTAL_TYPES = [
  {
    key: "annualTotalRevenue",
    label: "Revenue",
    period: "annual",
    perShare: false,
  },
  {
    key: "annualNetIncome",
    label: "Net income",
    period: "annual",
    perShare: false,
  },
  {
    key: "annualDilutedEPS",
    label: "Diluted EPS",
    period: "annual",
    perShare: true,
  },
  {
    key: "annualTotalAssets",
    label: "Total assets",
    period: "annual",
    perShare: false,
  },
  {
    key: "annualTotalDebt",
    label: "Total debt",
    period: "annual",
    perShare: false,
  },
  {
    key: "annualOperatingCashFlow",
    label: "Operating cash flow",
    period: "annual",
    perShare: false,
  },
  {
    key: "annualFreeCashFlow",
    label: "Free cash flow",
    period: "annual",
    perShare: false,
  },
  {
    key: "quarterlyTotalRevenue",
    label: "Revenue",
    period: "quarterly",
    perShare: false,
  },
  {
    key: "quarterlyNetIncome",
    label: "Net income",
    period: "quarterly",
    perShare: false,
  },
  {
    key: "quarterlyDilutedEPS",
    label: "Diluted EPS",
    period: "quarterly",
    perShare: true,
  },
] as const;

function parseFundamentals(
  payload: unknown,
  symbol: string,
  sourceUrl: string,
  now: number,
): ResearchFundamental[] {
  const results = list(row(row(payload).timeseries).result).map(row);
  return FUNDAMENTAL_TYPES.flatMap((definition) => {
    const series = results.find(
      (item) =>
        list(row(item.meta).type).includes(definition.key) &&
        list(row(item.meta).symbol).includes(symbol),
    );
    if (!series) return [];
    const facts = list(series[definition.key])
      .map(row)
      .filter((fact) => {
        const value = finite(row(fact.reportedValue).raw);
        return (
          value !== null &&
          /^\d{4}-\d{2}-\d{2}$/.test(text(fact.asOfDate)) &&
          Number.isFinite(Date.parse(text(fact.asOfDate))) &&
          new Date(text(fact.asOfDate)).toISOString().slice(0, 10) ===
            text(fact.asOfDate) &&
          Date.parse(text(fact.asOfDate)) <= now &&
          /^[A-Z]{3}$/.test(text(fact.currencyCode)) &&
          fact.periodType === (definition.period === "annual" ? "12M" : "3M")
        );
      })
      .sort((a, b) => text(b.asOfDate).localeCompare(text(a.asOfDate)));
    const distinctPeriods = [
      ...new Map(facts.map((fact) => [text(fact.asOfDate), fact])).values(),
    ].slice(0, 5);
    return distinctPeriods.map((fact) => ({
      id: definition.key,
      label: definition.label,
      value: row(fact.reportedValue).raw as number,
      unit: `${text(fact.currencyCode)}${definition.perShare ? "/share" : ""}`,
      periodEnd: text(fact.asOfDate),
      period: definition.period,
      sourceUrl,
    }));
  });
}

function parseEvents(
  chart: Row,
  currency: string | null,
  sourceUrl: string,
): ResearchEvent[] {
  const events = row(chart.events);
  const dividends = Object.entries(row(events.dividends)).flatMap(
    ([id, entry]) => {
      const item = row(entry),
        date = dateFromSeconds(item.date),
        amount = finite(item.amount);
      if (!date || amount === null || amount < 0 || !currency) return [];
      return [
        {
          id: `dividend-${id}`,
          type: "dividend" as const,
          title: "Ex-dividend date",
          date,
          detail: `${amount} ${currency} per underlying share. Token distributions follow the issuer's terms.`,
          sourceUrl,
        },
      ];
    },
  );
  const splits = Object.entries(row(events.splits)).flatMap(([id, entry]) => {
    const item = row(entry),
      date = dateFromSeconds(item.date),
      numerator = positive(item.numerator),
      denominator = positive(item.denominator);
    if (!date || numerator === null || denominator === null) return [];
    return [
      {
        id: `split-${id}`,
        type: "split" as const,
        title: "Stock split",
        date,
        detail: `${numerator}-for-${denominator} underlying stock split.`,
        sourceUrl,
      },
    ];
  });
  return [...dividends, ...splits]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);
}

function parseNews(
  payload: unknown,
  symbol: string,
  now: number,
): ResearchNews[] {
  return list(row(payload).news)
    .flatMap((value) => {
      const item = row(value),
        title = text(item.title),
        url = safeUrl(item.link),
        publishedAt = dateFromSeconds(item.providerPublishTime);
      if (
        !title ||
        !url ||
        !publishedAt ||
        Date.parse(publishedAt) > now + 60_000 ||
        !list(item.relatedTickers).includes(symbol)
      )
        return [];
      return [
        { title, url, publishedAt, publisher: text(item.publisher) || null },
      ];
    })
    .slice(0, 8);
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(incorporated|inc|corporation|corp|limited|ltd|plc|company|co|holdings)\b/g,
      "",
    )
    .replace(/[^a-z0-9]/g, "");
}

async function companyDescription(
  name: string,
  options: ResearchOptions,
): Promise<{ description: string; sourceUrl: string } | null> {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=3&format=json&utf8=1`;
  const search = row(await request(searchUrl, options));
  const targetName = normalizeCompanyName(name);
  // Exact normalized names only: never attach an unrelated search result's company facts.
  const match = list(row(search.query).search)
    .map(row)
    .find(
      (item) =>
        targetName.length >= 3 &&
        normalizeCompanyName(text(item.title)) === targetName,
    );
  if (!match || !Number.isSafeInteger(match.pageid)) return null;
  const extract = row(
    await request(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&pageids=${match.pageid}&format=json`,
      options,
    ),
  );
  const page = row(Object.values(row(row(extract.query).pages))[0]);
  if (page.pageid !== match.pageid) return null;
  const description = text(page.extract)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n\n");
  if (!description) return null;
  return {
    description:
      description.length > 1_200
        ? `${description.slice(0, 1_197).replace(/\s+\S*$/, "")}…`
        : description,
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(text(match.title).replace(/ /g, "_"))}`,
  };
}

function xmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_, entity: string) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[entity] ?? "",
    )
    .trim();
}

async function privateNews(
  name: string,
  options: ResearchOptions,
): Promise<ResearchNews[]> {
  const query = `"${name.replace(/["<>]/g, "")}" company`;
  const xml = text(
    await request(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
      options,
      "text",
    ),
  );
  if (!/<rss\b/i.test(xml))
    throw new Error("News provider did not return an RSS feed");
  return [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)]
    .slice(0, 8)
    .flatMap(([item]) => {
      const field = (tag: string): string =>
        xmlText(
          item.match(
            new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)<\\/${tag}>`),
          )?.[1] ?? "",
        );
      const publisher = field("source") || null;
      let title = field("title");
      if (publisher && title.endsWith(` - ${publisher}`))
        title = title.slice(0, -(publisher.length + 3));
      const url = safeUrl(field("link"));
      const published = Date.parse(field("pubDate"));
      return title && url
        ? [
            {
              title,
              url,
              publisher,
              publishedAt: Number.isFinite(published)
                ? new Date(published).toISOString()
                : null,
            },
          ]
        : [];
    });
}

const cache = new Map<string, { value: StockResearch; expiresAt: number }>();
const pending = new Map<string, Promise<StockResearch>>();

/** Public upstream endpoints are best-effort. Missing facts remain absent, never estimated. */
export async function getStockResearch(
  asset: ResearchAsset,
  options: ResearchOptions = {},
): Promise<StockResearch> {
  const symbol = asset.underlyingSymbol.trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,24}$/.test(symbol))
    throw new Error("Unsupported research symbol");
  const key = `${asset.mint}:${symbol}:${asset.kind}:${asset.issuer}`;
  const cached = cache.get(key);
  if (!options.fetcher && !options.now) {
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
  }
  const operation = loadStockResearch(asset, symbol, options);
  if (!options.fetcher && !options.now) pending.set(key, operation);
  try {
    const value = await operation;
    if (!options.fetcher && !options.now) {
      if (cache.size >= 128 && !cache.has(key))
        cache.delete(cache.keys().next().value as string);
      cache.set(key, {
        value,
        expiresAt:
          Date.now() + (value.status === "unavailable" ? 30_000 : 5 * 60_000),
      });
    }
    return value;
  } finally {
    if (!options.fetcher && !options.now) pending.delete(key);
  }
}

async function loadStockResearch(
  asset: ResearchAsset,
  symbol: string,
  options: ResearchOptions,
): Promise<StockResearch> {
  const now = (options.now ?? Date.now)();
  const asOf = new Date(now).toISOString();
  const output: StockResearch = {
    mint: asset.mint,
    symbol,
    asOf,
    status: "unavailable",
    profile: null,
    bars: [],
    technicals: null,
    fundamentals: [],
    events: [],
    news: [],
    sources: [],
    warnings: [],
  };
  if (asset.kind === "pre-ipo" || asset.issuer === "prestocks") {
    const [news, description] = await Promise.allSettled([
      privateNews(asset.name, options),
      companyDescription(asset.name, options),
    ]);
    if (news.status === "fulfilled") {
      output.news = news.value;
      if (output.news.length)
        output.sources.push({
          name: "Google News",
          url: "https://news.google.com/",
        });
    }
    if (description.status === "fulfilled" && description.value) {
      output.profile = {
        name: asset.name,
        description: description.value.description,
        sourceUrl: description.value.sourceUrl,
        observedAt: asOf,
        exchange: null,
        currency: null,
        sector: null,
        industry: null,
        website: null,
      };
      output.sources.push({
        name: "Wikipedia (CC BY-SA)",
        url: description.value.sourceUrl,
      });
    }
    output.warnings.push(
      "This is private-company exposure. Public-stock technicals, financial statements and corporate-action data are unavailable.",
    );
    if (news.status === "rejected")
      output.warnings.push("Company news is temporarily unavailable.");
    output.status =
      output.profile || output.news.length ? "partial" : "unavailable";
    return output;
  }

  // US share-class tickers use a hyphen at Yahoo. Preserve exchange suffixes such as .HK.
  const providerSymbol = /^[A-Z]{1,6}\.[AB]$/.test(symbol)
    ? symbol.replace(".", "-")
    : symbol;
  const encoded = encodeURIComponent(providerSymbol);
  const sourceUrl = `https://finance.yahoo.com/quote/${encoded}/`;
  const historyUrl = `${sourceUrl}history/`;
  const fundamentalsUrl = `${sourceUrl}financials/`;
  const periods = `period1=${Math.floor(now / 1000 - 4 * 366 * 86400)}&period2=${Math.floor(now / 1000)}`;
  const [chartResult, searchResult, financialResult] = await Promise.allSettled(
    [
      request(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=1y&interval=1d&events=div%2Csplits`,
        options,
      ),
      request(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encoded}&quotesCount=5&newsCount=10`,
        options,
      ),
      asset.kind === "etf"
        ? Promise.resolve(null)
        : request(
            `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encoded}?type=${FUNDAMENTAL_TYPES.map((value) => value.key).join(",")}&${periods}`,
            options,
          ),
    ],
  );
  const search =
    searchResult.status === "fulfilled" ? row(searchResult.value) : {};
  const quote = list(search.quotes)
    .map(row)
    .find((item) => item.symbol === providerSymbol);
  const chartPayload =
    chartResult.status === "fulfilled" ? row(row(chartResult.value).chart) : {};
  const chart =
    list(chartPayload.result)
      .map(row)
      .find((item) => row(item.meta).symbol === providerSymbol) ?? {};
  const meta = row(chart.meta);
  const companyName =
    text(meta.longName) ||
    text(quote?.longname) ||
    text(meta.shortName) ||
    text(quote?.shortname);
  if (companyName) {
    output.profile = {
      name: companyName,
      exchange: text(meta.fullExchangeName) || text(quote?.exchDisp) || null,
      currency: text(meta.currency) || null,
      sector: text(quote?.sectorDisp) || text(quote?.sector) || null,
      industry: text(quote?.industryDisp) || text(quote?.industry) || null,
      description: null,
      website: null,
      sourceUrl,
      observedAt: asOf,
    };
  }
  output.bars = parseBars(chart, now);
  output.technicals = calculateResearchTechnicals(output.bars, historyUrl);
  output.events = parseEvents(chart, text(meta.currency) || null, historyUrl);
  output.news = parseNews(search, providerSymbol, now);
  // Never attach financial facts to a ticker whose equity identity has not been confirmed.
  const equityConfirmed =
    meta.instrumentType === "EQUITY" || quote?.quoteType === "EQUITY";
  if (financialResult.status === "fulfilled" && equityConfirmed)
    output.fundamentals = parseFundamentals(
      financialResult.value,
      providerSymbol,
      fundamentalsUrl,
      now,
    );
  if (
    output.profile ||
    output.bars.length ||
    output.news.length ||
    output.fundamentals.length
  )
    output.sources.push({ name: "Yahoo Finance", url: sourceUrl });
  if (!output.bars.length)
    output.warnings.push(
      "Underlying price history and technicals are temporarily unavailable.",
    );
  if (searchResult.status === "rejected")
    output.warnings.push(
      "Company news and classification are temporarily unavailable.",
    );
  if (!output.fundamentals.length)
    output.warnings.push(
      asset.kind === "etf" || meta.instrumentType === "ETF"
        ? "Company financial statements do not apply to this fund."
        : "Reported company financial statements are unavailable from the public provider.",
    );
  if (output.profile) {
    try {
      const description = await companyDescription(
        output.profile.name,
        options,
      );
      if (description) {
        output.profile.description = description.description;
        output.sources.push({
          name: "Wikipedia (CC BY-SA)",
          url: description.sourceUrl,
        });
      }
    } catch {
      /* The company classification remains useful without an encyclopedia summary. */
    }
  }
  output.status = output.sources.length
    ? output.warnings.length
      ? "partial"
      : "available"
    : "unavailable";
  return output;
}
