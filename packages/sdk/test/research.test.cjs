const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateResearchTechnicals,
  getStockResearch,
} = require("../dist/research.js");

// Provider fixtures exist only in tests. Production research never seeds missing facts.
const now = Date.parse("2026-09-12T12:00:00Z");
const asset = {
  mint: "11111111111111111111111111111111",
  underlyingSymbol: "NVDA",
  name: "NVIDIA",
  issuer: "xstocks",
  kind: "equity",
};
const json = (value) => new Response(JSON.stringify(value));
const dailyBars = (values) =>
  values.map((close, index) => ({
    date: new Date(now - (values.length - index) * 86400000).toISOString(),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100 + index,
  }));
const fact = (value, asOfDate, currencyCode = "USD", periodType = "12M") => ({
  asOfDate,
  periodType,
  currencyCode,
  reportedValue: { raw: value },
});
const series = (type, values, symbol = "NVDA") => ({
  meta: { type: [type], symbol: [symbol] },
  [type]: values,
});
const chart = (symbol = "NVDA") => ({
  chart: {
    result: [
      {
        meta: {
          symbol,
          longName: "NVIDIA Corporation",
          fullExchangeName: "NasdaqGS",
          currency: "USD",
          instrumentType: "EQUITY",
        },
        timestamp: [1788958800, 1789045200, 1789131600, 1789218000],
        indicators: {
          quote: [
            {
              open: [10, 11, null, 14],
              high: [12, 13, 14, 12],
              low: [9, 10, 11, 11],
              close: [11, 12, 13, 13],
              volume: [100, 200, 300, 400],
            },
          ],
        },
        events: {
          dividends: { one: { date: 1789045200, amount: 0.25 } },
          splits: { two: { date: 1788958800, numerator: 10, denominator: 1 } },
        },
      },
    ],
  },
});

test("computes Wilder RSI and moving averages; insufficient history remains null", () => {
  const rising = calculateResearchTechnicals(
    dailyBars(Array.from({ length: 220 }, (_, index) => 10 + index)),
    "https://provider.example/history",
  );
  assert.equal(rising.rsi14, 100);
  assert.equal(rising.sma20, 219.5);
  assert.equal(rising.sma50, 204.5);
  assert.equal(rising.sma200, 129.5);
  assert.equal(rising.averageVolume20, 309.5);
  assert.equal(rising.trend, "above-50-day");
  const mixed = calculateResearchTechnicals(
    dailyBars([
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28,
    ]),
    "",
  );
  assert.ok(Math.abs(mixed.rsi14 - 70.46413502109705) < 1e-9);
  assert.equal(
    calculateResearchTechnicals(dailyBars(Array(20).fill(10)), "").rsi14,
    50,
  );
  assert.equal(
    calculateResearchTechnicals(
      dailyBars(Array.from({ length: 20 }, (_, index) => 30 - index)),
      "",
    ).rsi14,
    0,
  );
  const short = calculateResearchTechnicals(dailyBars([10, 11, 12]), "");
  assert.equal(short.rsi14, null);
  assert.equal(short.sma20, null);
  assert.equal(short.sma200, null);
  assert.equal(short.averageVolume20, null);
  assert.equal(short.high52w, null);
  assert.equal(short.low52w, null);
  assert.equal(calculateResearchTechnicals([], ""), null);
});

test("52-week ranges require a full calendar span and enough observed trading sessions", () => {
  const observations = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(now - (365 - index) * 86400000);
    return { date, close: 100 + index };
  }).filter(({ date }) => date.getUTCDay() !== 0 && date.getUTCDay() !== 6);
  const bars = observations.map(({ date, close }) => ({
    date: date.toISOString(),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  }));
  const complete = calculateResearchTechnicals(bars, "");
  assert.equal(complete.high52w, Math.max(...bars.map((bar) => bar.high)));
  assert.equal(complete.low52w, Math.min(...bars.map((bar) => bar.low)));
  const sparse = calculateResearchTechnicals(
    bars.filter((_, index) => index % 2 === 0),
    "",
  );
  assert.equal(sparse.high52w, null);
  assert.equal(sparse.low52w, null);
  const shortSpan = calculateResearchTechnicals(
    dailyBars(Array(220).fill(10)),
    "",
  );
  assert.equal(shortSpan.high52w, null);
  assert.equal(shortSpan.low52w, null);
});

test("daily close research excludes an open session and keeps it only after its verified end", async () => {
  const timestamps = ["2026-09-10T13:30:00Z", "2026-09-11T13:30:00Z"].map(
    (date) => Date.parse(date) / 1000,
  );
  const regular = {
    start: timestamps[1],
    end: Date.parse("2026-09-11T20:00:00Z") / 1000,
  };
  const run = async (at, includeSession = true) =>
    getStockResearch(asset, {
      now: () => Date.parse(at),
      fetcher: async (input) => {
        if (!String(input).includes("/chart/")) return json({});
        return json({
          chart: {
            result: [
              {
                meta: {
                  symbol: "NVDA",
                  instrumentType: "EQUITY",
                  exchangeTimezoneName: "America/New_York",
                  ...(includeSession
                    ? { currentTradingPeriod: { regular } }
                    : {}),
                },
                timestamp: timestamps,
                indicators: {
                  quote: [
                    {
                      open: [10, 20],
                      high: [12, 22],
                      low: [9, 19],
                      close: [11, 21],
                      volume: [100, 200],
                    },
                  ],
                },
              },
            ],
          },
        });
      },
    });
  const open = await run("2026-09-11T15:00:00Z");
  assert.equal(open.bars.length, 1);
  assert.equal(open.technicals.close, 11);
  assert.equal(open.technicals.asOf, "2026-09-10T13:30:00.000Z");
  const closed = await run("2026-09-11T20:01:00Z");
  assert.equal(closed.bars.length, 2);
  assert.equal(closed.technicals.close, 21);
  const unverified = await run("2026-09-11T20:01:00Z", false);
  assert.equal(unverified.bars.length, 1);
  assert.equal(unverified.technicals.close, 11);
});

test("preserves reported currency, periods and zero values; discards malformed bars and unrelated news", async () => {
  const result = await getStockResearch(asset, {
    now: () => now,
    fetcher: async (input) => {
      const url = String(input);
      if (url.includes("/chart/")) return json(chart());
      if (url.includes("/finance/search"))
        return json({
          quotes: [
            {
              symbol: "NVDA",
              longname: "NVIDIA Corporation",
              quoteType: "EQUITY",
              sector: "Technology",
            },
          ],
          news: [
            {
              title: "Company update",
              link: "https://publisher.example/article",
              providerPublishTime: 1789045200,
              publisher: "Publisher",
              relatedTickers: ["NVDA"],
            },
            {
              title: "Other company",
              link: "https://publisher.example/other",
              providerPublishTime: 1789045200,
              relatedTickers: ["AAPL"],
            },
            {
              title: "Unsafe link",
              link: "javascript:alert(1)",
              providerPublishTime: 1789045200,
              relatedTickers: ["NVDA"],
            },
          ],
        });
      if (url.includes("/timeseries/"))
        return json({
          timeseries: {
            result: [
              series("annualTotalRevenue", [
                fact(50, "2024-12-31"),
                fact(100, "2025-12-31", "EUR"),
                fact(500, "2030-12-31"),
              ]),
              series("annualNetIncome", [fact(0, "2025-12-31", "EUR")]),
              series("annualDilutedEPS", [fact(1.25, "2025-12-31", "EUR")]),
              series("quarterlyTotalRevenue", [
                fact(30, "2026-03-31", "EUR", "3M"),
                fact(60, "2026-06-30", "EUR", "6M"),
              ]),
              series("annualTotalDebt", [fact(5, "2025-12-31")], "AAPL"),
            ],
          },
        });
      return json({ query: { search: [] } });
    },
  });
  assert.equal(result.status, "available");
  assert.equal(
    result.fundamentals.filter((item) => item.id === "annualTotalRevenue")
      .length,
    2,
  );
  assert.equal(result.bars.length, 2);
  assert.equal(result.technicals.close, 12);
  assert.equal(
    result.fundamentals.find((item) => item.id === "annualTotalRevenue").value,
    100,
  );
  assert.equal(
    result.fundamentals.find((item) => item.id === "annualTotalRevenue").unit,
    "EUR",
  );
  assert.equal(
    result.fundamentals.find((item) => item.id === "annualTotalRevenue")
      .periodEnd,
    "2025-12-31",
  );
  assert.equal(
    result.fundamentals.find((item) => item.id === "annualNetIncome").value,
    0,
  );
  assert.equal(
    result.fundamentals.find((item) => item.id === "annualDilutedEPS").unit,
    "EUR/share",
  );
  assert.equal(
    result.fundamentals.find((item) => item.id === "quarterlyTotalRevenue")
      .periodEnd,
    "2026-03-31",
  );
  assert.equal(
    result.fundamentals.some((item) => item.id === "annualTotalDebt"),
    false,
  );
  assert.equal(result.news.length, 1);
  assert.equal(result.events.length, 2);
  assert.match(result.events[0].detail, /underlying share/);
  assert.equal(result.profile.sector, "Technology");
});

test("never attaches mismatched symbols or unrelated encyclopedia results to the company", async () => {
  const requests = [];
  const result = await getStockResearch(asset, {
    now: () => now,
    fetcher: async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("/chart/")) return json(chart("AAPL"));
      if (url.includes("/finance/search"))
        return json({
          quotes: [
            { symbol: "AAPL", longname: "Apple Inc.", quoteType: "EQUITY" },
          ],
        });
      if (url.includes("/timeseries/"))
        return json({
          timeseries: {
            result: [series("annualTotalRevenue", [fact(100, "2025-12-31")])],
          },
        });
      return json({
        query: { search: [{ title: "Some other corporation", pageid: 100 }] },
      });
    },
  });
  assert.equal(result.profile, null);
  assert.equal(result.bars.length, 0);
  assert.equal(result.fundamentals.length, 0);
  assert.equal(result.status, "unavailable");
  assert.equal(
    requests.some((url) => url.includes("wikipedia")),
    false,
  );
});

test("private companies do not query a coincidentally matching public stock ticker", async () => {
  const requests = [];
  const result = await getStockResearch(
    {
      ...asset,
      underlyingSymbol: "OPENAI",
      name: "OpenAI",
      issuer: "prestocks",
      kind: "pre-ipo",
    },
    {
      now: () => now,
      fetcher: async (input) => {
        const url = String(input);
        requests.push(url);
        if (url.includes("news.google.com"))
          return new Response(
            "<rss><channel><item><title>OpenAI update - Publisher</title><link>https://publisher.example/openai</link><source>Publisher</source><pubDate>Fri, 11 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>",
          );
        if (url.includes("list=search"))
          return json({ query: { search: [{ title: "OpenAI", pageid: 42 }] } });
        return json({
          query: {
            pages: {
              42: {
                pageid: 42,
                extract: "A provider-returned company description.",
              },
            },
          },
        });
      },
    },
  );
  assert.equal(result.status, "partial");
  assert.equal(
    requests.some((url) => url.includes("finance.yahoo.com")),
    false,
  );
  assert.equal(result.bars.length, 0);
  assert.equal(result.fundamentals.length, 0);
  assert.equal(result.news[0].title, "OpenAI update");
  assert.equal(result.profile.name, "OpenAI");
  assert.equal(result.profile.exchange, null);
});

test("provider outages never populate synthetic values, bars, news or fundamentals", async () => {
  const result = await getStockResearch(asset, {
    now: () => now,
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.profile, null);
  assert.equal(result.technicals, null);
  for (const field of ["bars", "fundamentals", "events", "news", "sources"])
    assert.deepEqual(result[field], []);
  await assert.rejects(
    getStockResearch({ ...asset, underlyingSymbol: "https://example.com" }),
    /Unsupported research symbol/,
  );
});

test("an unrelated encyclopedia result is not used as the company overview", async () => {
  const urls = [];
  const result = await getStockResearch(asset, {
    now: () => now,
    fetcher: async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/chart/")) return json(chart());
      if (url.includes("list=search"))
        return json({
          query: { search: [{ pageid: 123, title: "Different company" }] },
        });
      return json({});
    },
  });
  assert.equal(result.profile.name, "NVIDIA Corporation");
  assert.equal(result.profile.description, null);
  assert.equal(
    urls.some((url) => url.includes("prop=extracts")),
    false,
  );
});
