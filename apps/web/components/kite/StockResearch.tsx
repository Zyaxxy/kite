"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import type { MarketAsset, StockResearch } from "@kite/sdk";
import { Change, Empty } from "./MarketUI";

type ResearchTab =
  "Overview" | "Technicals" | "Fundamentals" | "News" | "Events";
const tabs: ResearchTab[] = [
  "Overview",
  "Technicals",
  "Fundamentals",
  "News",
  "Events",
];
const cache = new Map<string, { data: StockResearch; expiresAt: number }>();
const number = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "Unavailable"
    : value.toLocaleString("en-US", { maximumFractionDigits: digits });
const date = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Date unavailable";
const value = (
  amount: number | null,
  currency: string | null = "USD",
  compact = false,
) => {
  if (amount == null || !Number.isFinite(amount)) return "Unavailable";
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(amount);
};

function useResearch(mint: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    mint: string;
    data: StockResearch | null;
    loading: boolean;
    error: string | null;
  }>({ mint, data: null, loading: true, error: null });
  useEffect(() => {
    const saved = cache.get(mint);
    if (saved && saved.expiresAt > Date.now() && attempt === 0) {
      setState({ mint, data: saved.data, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let active = true;
    setState({ mint, data: saved?.data ?? null, loading: true, error: null });
    void fetch(`/api/research?mint=${encodeURIComponent(mint)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Company research is temporarily unavailable. Please retry.",
          );
        const data = (await response.json()) as StockResearch;
        if (data.mint !== mint)
          throw new Error("The research response did not match this asset.");
        if (data.status !== "unavailable") {
          if (cache.size >= 50) cache.delete(cache.keys().next().value!);
          cache.set(mint, { data, expiresAt: Date.now() + 300_000 });
        }
        if (active) setState({ mint, data, loading: false, error: null });
      })
      .catch(() => {
        if (active)
          setState({
            mint,
            data: saved?.data ?? null,
            loading: false,
            error: "Company research is temporarily unavailable. Please retry.",
          });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [mint, attempt]);
  return {
    ...(state.mint === mint
      ? state
      : { data: null, loading: true, error: null }),
    retry: () => setAttempt((current) => current + 1),
  };
}

function Range({
  label,
  low,
  high,
  current,
  currency,
}: {
  label: string;
  low: number | null;
  high: number | null;
  current: number | null;
  currency: string | null;
}) {
  const position =
    low != null && high != null && current != null && high > low
      ? Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100))
      : null;
  return (
    <div className="research-range">
      <span className="eyebrow">{label}</span>
      <div className="flex-between">
        <span>
          <small>Low</small>
          <strong>{value(low, currency)}</strong>
        </span>
        <span className="text-right">
          <small>High</small>
          <strong>{value(high, currency)}</strong>
        </span>
      </div>
      <div className="range-track">
        {position != null && <i style={{ left: `${position}%` }} />}
      </div>
    </div>
  );
}

function PriceHistory({ research }: { research: StockResearch }) {
  const [period, setPeriod] = useState<"1M" | "3M" | "6M" | "1Y">("3M");
  const [cursor, setCursor] = useState<number | null>(null);
  const gradient = useId().replace(/:/g, "");
  const bars = useMemo(
    () =>
      research.bars.slice(
        -{ "1M": 22, "3M": 66, "6M": 132, "1Y": 264 }[period],
      ),
    [research.bars, period],
  );
  if (bars.length < 2)
    return (
      <Empty
        icon={BookOpen}
        title="Price history is not available"
        description="A chart appears when the source returns a usable daily history for the underlying security."
      />
    );
  const width = 680,
    height = 205,
    pad = 10;
  const minimum = Math.min(...bars.map((bar) => bar.close));
  const maximum = Math.max(...bars.map((bar) => bar.close));
  const spread = maximum - minimum || maximum * 0.01 || 1;
  const x = (index: number) =>
    pad + (index / (bars.length - 1)) * (width - pad * 2);
  const y = (price: number) =>
    pad + ((maximum - price) / spread) * (height - pad * 2);
  const path = bars
    .map(
      (bar, index) =>
        `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(bar.close).toFixed(2)}`,
    )
    .join(" ");
  const selected =
    cursor == null ? bars.length - 1 : Math.min(cursor, bars.length - 1);
  const quote = bars[selected];
  const change =
    bars[0].close > 0 ? (quote.close / bars[0].close - 1) * 100 : null;
  return (
    <div className="research-history">
      <div className="research-chart-head">
        <div>
          <p className="eyebrow">{research.symbol} · Underlying share</p>
          <strong>
            {value(quote.close, research.profile?.currency ?? null)}
          </strong>
          <span>
            <Change value={change} /> <small>from first close in view</small>
          </span>
        </div>
        <span className="research-chart-date">
          {date(quote.date)}
          <small>Daily close</small>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="research-chart"
        role="img"
        aria-label={`${research.symbol} daily closing prices for ${period}. From ${value(bars[0].close, research.profile?.currency ?? null)} to ${value(bars[bars.length - 1].close, research.profile?.currency ?? null)}.`}
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setCursor(
            Math.round(
              Math.max(
                0,
                Math.min(1, (event.clientX - bounds.left) / bounds.width),
              ) *
                (bars.length - 1),
            ),
          );
        }}
        onMouseLeave={() => setCursor(null)}
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".17" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2={width}
            y1={height * fraction}
            y2={height * fraction}
            stroke="var(--line)"
            strokeDasharray="3 6"
          />
        ))}
        <path
          d={`${path} L${x(bars.length - 1)},${height} L${pad},${height} Z`}
          fill={`url(#${gradient})`}
        />
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {cursor != null && (
          <>
            <line
              x1={x(selected)}
              x2={x(selected)}
              y1="0"
              y2={height}
              stroke="var(--muted)"
              strokeDasharray="3 4"
            />
            <circle
              cx={x(selected)}
              cy={y(quote.close)}
              r="4"
              fill="var(--accent)"
            />
          </>
        )}
      </svg>
      <div className="chart-date-axis">
        <span>{date(bars[0].date)}</span>
        <span>{date(bars[bars.length - 1].date)}</span>
      </div>
      <input
        className="chart-scrubber"
        type="range"
        min={0}
        max={bars.length - 1}
        value={selected}
        onChange={(event) => setCursor(Number(event.target.value))}
        aria-label="Explore daily closing prices"
      />
      <div className="research-chart-footer">
        <div
          className="filter-tabs"
          role="group"
          aria-label="Price history period"
        >
          {(["1M", "3M", "6M", "1Y"] as const).map((item) => (
            <button
              key={item}
              aria-pressed={period === item}
              className={period === item ? "active" : ""}
              onClick={() => {
                setPeriod(item);
                setCursor(null);
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <span>Underlying security · not a token quote</span>
      </div>
    </div>
  );
}

function Overview({ research }: { research: StockResearch }) {
  const profile = research.profile;
  const last = research.bars.at(-1);
  return (
    <div className="research-stack">
      <PriceHistory research={research} />
      <div className="research-split">
        <Range
          label="Latest session range"
          low={last?.low ?? null}
          high={last?.high ?? null}
          current={last?.close ?? null}
          currency={profile?.currency ?? null}
        />
        <Range
          label="52 week range"
          low={research.technicals?.low52w ?? null}
          high={research.technicals?.high52w ?? null}
          current={last?.close ?? null}
          currency={profile?.currency ?? null}
        />
      </div>
      <section className="research-section">
        <div className="section-head">
          <h3>The company behind the ticker</h3>
          <BookOpen size={17} className="muted" />
        </div>
        <p className="research-copy">
          {profile?.description ||
            (profile
              ? `${profile.name}${profile.exchange ? ` is listed on ${profile.exchange}` : ""}. ${[profile.sector, profile.industry].filter(Boolean).join(" · ")}${profile.sector || profile.industry ? "." : ""}`
              : "A company profile is not currently available from the research source.")}
        </p>
        <dl className="research-metrics">
          <div>
            <dt>Company</dt>
            <dd>{profile?.name || research.symbol}</dd>
          </div>
          <div>
            <dt>Exchange</dt>
            <dd>{profile?.exchange || "Unavailable"}</dd>
          </div>
          <div>
            <dt>Sector</dt>
            <dd>{profile?.sector || "Unavailable"}</dd>
          </div>
          <div>
            <dt>Industry</dt>
            <dd>{profile?.industry || "Unavailable"}</dd>
          </div>
        </dl>
        {profile?.sourceUrl && (
          <a
            href={profile.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            View company source <ExternalLink size={12} />
          </a>
        )}
      </section>
    </div>
  );
}

function Technicals({ research }: { research: StockResearch }) {
  const technicals = research.technicals;
  if (!technicals)
    return (
      <Empty
        title="More history is needed"
        description="Technical indicators are calculated from reported daily closes. They remain unavailable when the price series is incomplete."
      />
    );
  const currency = research.profile?.currency ?? null;
  const metrics = [
    ["20 day average", value(technicals.sma20, currency)],
    ["50 day average", value(technicals.sma50, currency)],
    ["200 day average", value(technicals.sma200, currency)],
    ["RSI · 14 sessions", number(technicals.rsi14)],
    ["20 day average volume", number(technicals.averageVolume20, 0)],
    ["Latest close", value(technicals.close, currency)],
  ];
  return (
    <div className="research-section">
      <div className="section-head">
        <div>
          <h3>A closer look at momentum</h3>
          <p>Underlying daily prices through {date(technicals.asOf)}</p>
        </div>
      </div>
      <div className="technical-grid">
        {metrics.map(([label, display]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{display}</strong>
          </div>
        ))}
      </div>
      <div className="technical-note">
        <span className="badge lime">
          {technicals.trend === "above-50-day"
            ? "Above 50 day average"
            : technicals.trend === "below-50-day"
              ? "Below 50 day average"
              : technicals.trend === "at-50-day"
                ? "At 50 day average"
                : "Trend unavailable"}
        </span>
        <p>
          Moving averages smooth daily closes. RSI measures the balance of
          recent gains and losses on a 0–100 scale. These describe past prices;
          they are not forecasts or trade recommendations.
        </p>
      </div>
      <Range
        label="52 week range"
        low={technicals.low52w}
        high={technicals.high52w}
        current={technicals.close}
        currency={currency}
      />
    </div>
  );
}

function Fundamentals({ research }: { research: StockResearch }) {
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");
  const rows = research.fundamentals.filter((item) => item.period === period);
  const latestByMetric = new Map<
    string,
    StockResearch["fundamentals"][number]
  >();
  for (const item of [...rows].sort((a, b) =>
    a.periodEnd.localeCompare(b.periodEnd),
  ))
    latestByMetric.set(item.id, item);
  const latest = [...latestByMetric.values()];
  const revenueRows = rows
    .filter((item) => /revenue/i.test(item.id + item.label))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const revenue = revenueRows
    .filter((item) => item.unit === revenueRows.at(-1)?.unit)
    .slice(-5);
  const largest = Math.max(...revenue.map((item) => Math.abs(item.value)), 1);
  const format = (item: StockResearch["fundamentals"][number]) =>
    /^[A-Z]{3}$/.test(item.unit)
      ? value(item.value, item.unit, true)
      : `${number(item.value)} ${item.unit}`;
  return (
    <div className="research-section">
      <div className="section-head">
        <div>
          <h3>The business, in numbers</h3>
          <p>Reported company financials, separate from token market value.</p>
        </div>
      </div>
      <div
        className="filter-tabs research-period"
        role="group"
        aria-label="Financial reporting period"
      >
        {(["annual", "quarterly"] as const).map((item) => (
          <button
            key={item}
            className={period === item ? "active" : ""}
            aria-pressed={period === item}
            onClick={() => setPeriod(item)}
          >
            {item === "annual" ? "Annual" : "Quarterly"}
          </button>
        ))}
      </div>
      {!rows.length ? (
        <Empty
          title="Financials are not available"
          description="The source has not returned reported financial statements for this security and reporting period."
        />
      ) : (
        <>
          <dl className="research-metrics fundamentals-metrics">
            {latest.map((item) => (
              <div key={item.id}>
                <dt>{item.label}</dt>
                <dd>{format(item)}</dd>
                <small>Period ending {date(item.periodEnd)}</small>
              </div>
            ))}
          </dl>
          {revenue.length > 1 && (
            <div className="financial-history">
              <h4>Revenue across reported periods</h4>
              <div className="financial-bars">
                {revenue.map((item) => (
                  <div key={`${item.id}-${item.periodEnd}`}>
                    <span>{format(item)}</span>
                    <div className="financial-bar-track">
                      <i
                        style={{
                          height: `${Math.max(1, (Math.abs(item.value) / largest) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>{date(item.periodEnd)}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="research-footnote">
            Financial periods can differ between companies. Values are shown in
            the units reported by the source; no missing ratios are estimated.
          </p>
        </>
      )}
    </div>
  );
}

function News({ research }: { research: StockResearch }) {
  return research.news.length ? (
    <div className="research-news">
      {research.news.map((item) => (
        <a key={item.url} href={item.url} target="_blank" rel="noreferrer">
          <div>
            <span className="eyebrow">{item.publisher || "Company news"}</span>
            <ArrowUpRight size={17} />
          </div>
          <h3>{item.title}</h3>
          <time>{date(item.publishedAt)}</time>
        </a>
      ))}
    </div>
  ) : (
    <Empty
      title="No recent articles returned"
      description="Company headlines appear here when the news provider has matching coverage."
    />
  );
}

function Events({ research }: { research: StockResearch }) {
  return research.events.length ? (
    <div className="research-section">
      <div className="section-head">
        <div>
          <h3>Recent corporate actions</h3>
          <p>
            Reported dividends, splits and filings. These are historical events,
            not an upcoming earnings calendar.
          </p>
        </div>
      </div>
      <div className="event-list">
        {research.events.map((item) => (
          <a
            key={item.id}
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span className="event-icon">
              <CalendarDays size={19} />
            </span>
            <div>
              <span className="eyebrow">
                {item.type} · {date(item.date)}
              </span>
              <h4>{item.title}</h4>
              <p>{item.detail}</p>
            </div>
            <ArrowUpRight size={15} />
          </a>
        ))}
      </div>
    </div>
  ) : (
    <Empty
      icon={CalendarDays}
      title="No confirmed events returned"
      description="Dates will appear when the source reports a dividend, split, or filing. Unconfirmed future dates are not estimated."
    />
  );
}

export function StockResearchPanel({ asset }: { asset: MarketAsset }) {
  const { data, loading, error, retry } = useResearch(asset.mint);
  const [tab, setTab] = useState<ResearchTab>("Overview");
  const id = useId();
  return (
    <section className="panel stock-research" aria-label="Company research">
      <div className="research-header">
        <div>
          <span className="eyebrow">Behind the asset</span>
          <h2>Build your point of view.</h2>
        </div>
        <button
          className="icon-btn"
          aria-label="Refresh company research"
          disabled={loading}
          onClick={retry}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <div
        className="research-tabs"
        role="tablist"
        aria-label="Company research sections"
      >
        {tabs.map((item, index) => (
          <button
            key={item}
            id={`${id}-tab-${item}`}
            role="tab"
            aria-selected={tab === item}
            aria-controls={`${id}-panel`}
            tabIndex={tab === item ? 0 : -1}
            onClick={() => setTab(item)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + tabs.length) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setTab(tabs[next]);
                document.getElementById(`${id}-tab-${tabs[next]}`)?.focus();
              }
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${tab}`}
        tabIndex={0}
      >
        {loading && !data ? (
          <div className="research-loading" role="status">
            <RefreshCw size={20} />
            <h3>Gathering the company picture</h3>
            <p>Loading reported financials, price history, and news.</p>
          </div>
        ) : null}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button onClick={retry}>Retry</button>
          </div>
        )}
        {data &&
          (tab === "Overview" ? (
            <Overview research={data} />
          ) : tab === "Technicals" ? (
            <Technicals research={data} />
          ) : tab === "Fundamentals" ? (
            <Fundamentals research={data} />
          ) : tab === "News" ? (
            <News research={data} />
          ) : (
            <Events research={data} />
          ))}
      </div>
      {data && (
        <footer className="research-sources">
          <p>
            Company research uses the underlying security, which may trade at a
            different price and scale from {asset.symbol}. Retrieved{" "}
            {date(data.asOf)}.
          </p>
          <div>
            {data.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.name}
                <ExternalLink size={10} />
              </a>
            ))}
          </div>
          {data.warnings.length > 0 && (
            <details>
              <summary>Data availability</summary>
              {data.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </details>
          )}
        </footer>
      )}
    </section>
  );
}
