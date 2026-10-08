"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Pause,
} from "lucide-react";
import type { MarketAsset, StockResearch } from "@kite/sdk";
import { AssetAvatar, Change, compactMoney, money } from "./MarketUI";
import { researchClient } from "./research-client";
import { gsap, useScrollStory } from "./landing-motion";
import styles from "./Landing.module.css";

const tabs = [
  "Overview",
  "Technicals",
  "Fundamentals",
  "News",
  "Events",
] as const;
type Tab = (typeof tabs)[number];
const date = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Date unavailable";
const number = (value: number | null | undefined) =>
  value != null && Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "Unavailable";

/** Persistent panes crossfade on a single normalized scroll timeline. */
function buildResearchStory(
  timeline: gsap.core.Timeline,
  element: HTMLDivElement,
) {
  const panes = Array.from(element.querySelectorAll("[data-research-pane]"));
  const indicator = element.querySelector("[data-research-indicator]");
  timeline
    .set(panes, { autoAlpha: 0, y: 8 }, 0)
    .set(panes[0], { autoAlpha: 1, y: 0 }, 0)
    .set(indicator, { xPercent: 0 }, 0);
  for (let index = 1; index < panes.length; index++) {
    const at = index / tabs.length;
    timeline
      .to(panes[index - 1], { autoAlpha: 0, y: -6, duration: 0.035 }, at - 0.03)
      .to(
        panes[index],
        { autoAlpha: 1, y: 0, duration: 0.06, ease: "power2.out" },
        at - 0.02,
      )
      .to(
        indicator,
        { xPercent: index * 100, duration: 0.065, ease: "power2.inOut" },
        at - 0.03,
      );
  }
}

export function LandingResearch({
  asset,
  loading,
}: {
  asset?: MarketAsset;
  loading: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<{
    mint: string;
    data: StockResearch | null;
    loading: boolean;
    failed: boolean;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const tabStrip = useRef<HTMLDivElement>(null);
  const { step, mode, select, toggle } = useScrollStory(
    root,
    tabs.length,
    "kite-research-story",
    buildResearchStory,
  );
  const tab = tabs[step];
  const id = useId();
  const mint = asset?.mint;

  useEffect(() => {
    const strip = tabStrip.current;
    const button = document.getElementById(`${id}-${tab}`);
    if (!strip || !button) return;
    const left =
      button.offsetLeft - (strip.clientWidth - button.clientWidth) / 2;
    strip.scrollTo({
      left: Math.max(0, left),
      behavior: mode === "static" ? "auto" : "smooth",
    });
  }, [id, tab, mode]);

  useEffect(() => {
    if (!root.current) return;
    if (!window.IntersectionObserver) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mint || !visible) return;
    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshes = 0;
    setState({
      mint,
      data: researchClient.peek(mint),
      loading: true,
      failed: false,
    });
    async function load(force = false) {
      try {
        const data = await researchClient.load(mint!, controller.signal, force);
        if (!active) return;
        setState({ mint: mint!, data, loading: false, failed: false });
        if (data.refreshing && refreshes++ < 3)
          timer = setTimeout(() => void load(true), 2500);
      } catch {
        if (active)
          setState({
            mint: mint!,
            data: researchClient.peek(mint!),
            loading: false,
            failed: true,
          });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [mint, visible]);

  const data = state && state.mint === mint ? state.data : null;
  const pending = asset
    ? !state || state.mint !== mint || state.loading
    : loading;
  const bars = (data?.bars ?? [])
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
    .slice(-66);
  const chart = (() => {
    if (bars.length < 2) return null;
    const min = Math.min(...bars.map((bar) => bar.close));
    const max = Math.max(...bars.map((bar) => bar.close));
    const range = max - min || max * 0.01;
    return bars
      .map(
        (bar, index) =>
          `${index ? "L" : "M"}${((index / (bars.length - 1)) * 420).toFixed(2)},${(112 - ((bar.close - min) / range) * 95).toFixed(2)}`,
      )
      .join(" ");
  })();

  function empty(title: string, description: string) {
    return (
      <div className={styles.researchEmpty} role="status">
        <BookOpen size={23} strokeWidth={1.4} />
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    );
  }
  function content(view: Tab) {
    if (!asset)
      return empty(
        loading
          ? "Connecting to the markets…"
          : "Research starts with real data.",
        "Explore the issuer catalog. Observed prices will appear when sources are available.",
      );
    if (view === "Overview")
      return chart ? (
        <>
          <div className={styles.chartSummary}>
            <span>Historical share close</span>
            <strong>
              {data?.profile?.currency === "USD"
                ? money(bars[bars.length - 1].close)
                : `${number(bars[bars.length - 1].close)} ${data?.profile?.currency ?? ""}`}
            </strong>
          </div>
          <svg
            className={styles.researchChart}
            viewBox="0 0 420 125"
            role="img"
            aria-label={`${data?.symbol} underlying daily closing prices, ${date(bars[0].date)} to ${date(bars[bars.length - 1].date)}; historical data, not the token price`}
          >
            <path
              className={styles.chartGrid}
              d="M0 20H420M0 65H420M0 112H420"
            />
            <path
              className={styles.chartLine}
              d={chart}
              pathLength="1"
              data-research-line
            />
          </svg>
          <div className={styles.chartCaption}>
            <span>{date(bars[0].date)}</span>
            <span>Underlying share · Daily closes</span>
            <span>{date(bars[bars.length - 1].date)}</span>
          </div>
        </>
      ) : (
        empty(
          pending
            ? "Loading company price history…"
            : "Price history unavailable",
          "The chart uses observed underlying share closes. It appears when the source returns usable history.",
        )
      );
    if (view === "Technicals")
      return data?.technicals ? (
        <dl className={styles.researchMetrics}>
          <div>
            <dt>RSI · 14 days</dt>
            <dd>{number(data.technicals.rsi14)}</dd>
          </div>
          <div>
            <dt>20-day moving average</dt>
            <dd>{number(data.technicals.sma20)}</dd>
          </div>
          <div>
            <dt>50-day moving average</dt>
            <dd>{number(data.technicals.sma50)}</dd>
          </div>
          <div>
            <dt>200-day moving average</dt>
            <dd>{number(data.technicals.sma200)}</dd>
          </div>
        </dl>
      ) : (
        empty(
          pending ? "Loading technical indicators…" : "Indicators unavailable",
          "Moving averages and RSI are derived from observed underlying share closes.",
        )
      );
    if (view === "Fundamentals")
      return data?.fundamentals.length ? (
        <dl className={styles.researchMetrics}>
          {data.fundamentals.slice(0, 4).map((item) => (
            <div key={JSON.stringify([item.id, item.period, item.periodEnd])}>
              <dt>
                {item.label} · {date(item.periodEnd)}
              </dt>
              <dd>
                {item.unit === "USD"
                  ? compactMoney(item.value)
                  : `${number(item.value)} ${item.unit}`}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        empty(
          pending
            ? "Loading company fundamentals…"
            : "Fundamentals unavailable",
          "Company revenue, earnings and financial statements appear where upstream sources provide them.",
        )
      );
    if (view === "News")
      return data?.news.length ? (
        <div className={styles.researchNews}>
          {data.news.slice(0, 2).map((item) => (
            <a
              key={item.url}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={tab === view ? 0 : -1}
            >
              <span title={item.title}>{item.title}</span>
              <small>
                {item.publisher ?? "Source"} · {date(item.publishedAt)} · Opens
                in a new tab
              </small>
            </a>
          ))}
        </div>
      ) : (
        empty(
          pending ? "Loading company news…" : "News unavailable",
          "Source-attributed headlines appear when company news is available.",
        )
      );
    return data?.events.length ? (
      <div className={styles.researchNews}>
        {data.events.slice(0, 2).map((item) => (
          <a
            key={item.id}
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={tab === view ? 0 : -1}
          >
            <span title={item.title}>{item.title}</span>
            <small>
              {item.type} · {date(item.date)} · Opens in a new tab
            </small>
          </a>
        ))}
      </div>
    ) : (
      empty(
        pending ? "Loading company events…" : "Events unavailable",
        "Source-backed dividends, splits and filings appear where upstream data exists.",
      )
    );
  }

  return (
    <div
      className={styles.researchPanel}
      ref={root}
      data-story-stage
      data-research-step={step}
      data-scroll-mode={mode}
    >
      <div className={styles.panelTop}>
        <span className={styles.eyebrow}>THE RESEARCH WORKSPACE</span>
        <button
          className={styles.storyControl}
          onClick={toggle}
          aria-label={
            mode === "static"
              ? "Next research view"
              : mode === "scroll"
                ? "Pause research scroll story"
                : "Follow scroll in research workspace"
          }
        >
          {mode === "scroll" ? (
            <Pause size={13} />
          ) : mode === "static" ? (
            <ArrowRight size={13} />
          ) : (
            <ArrowDown size={13} />
          )}
          {mode === "scroll"
            ? "Pause"
            : mode === "static"
              ? "Next view"
              : "Follow scroll"}
        </button>
      </div>
      <div className={styles.researchAsset}>
        {asset ? (
          <>
            <AssetAvatar asset={asset} />
            <div>
              <h3>{asset.name.replace(/ xStock$/i, "")}</h3>
              <p>
                {asset.symbol} · {asset.issuer} · Solana token
              </p>
            </div>
            <Link
              href={`/stock/${encodeURIComponent(asset.mint)}`}
              aria-label={`Open ${asset.name} research`}
            >
              <ArrowUpRight size={17} />
            </Link>
          </>
        ) : (
          <div>
            <h3>Know the company.</h3>
            <p>Company context. Token details. Observed data.</p>
          </div>
        )}
      </div>
      {asset && (
        <>
          <div className={styles.researchQuote}>
            <strong>{money(asset.priceUsd)}</strong>
            <span>
              <Change value={asset.change24hPct} /> <small>24h</small>
            </span>
          </div>
          <p className={styles.quoteTime}>
            Observed token price ·{" "}
            {date(asset.priceObservedAt ?? asset.updatedAt)}
          </p>
        </>
      )}
      <div className={styles.researchTabs} ref={tabStrip}>
        <div
          className={styles.researchTabList}
          role="tablist"
          aria-label="Research views"
        >
          <span
            className={styles.researchTabIndicator}
            data-research-indicator
            aria-hidden="true"
          />
          {tabs.map((name, index) => (
            <button
              key={name}
              id={`${id}-${name}`}
              role="tab"
              aria-selected={tab === name}
              aria-controls={`${id}-panel-${name}`}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next != null) {
                  event.preventDefault();
                  select(next);
                  document
                    .getElementById(`${id}-${tabs[next]}`)
                    ?.focus({ preventScroll: true });
                }
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.researchBody}>
        {tabs.map((name) => (
          <div
            key={name}
            id={`${id}-panel-${name}`}
            role="tabpanel"
            aria-labelledby={`${id}-${name}`}
            aria-hidden={tab !== name}
            ref={(node) => {
              if (node) node.inert = tab !== name;
            }}
            className={styles.researchPane}
            data-research-pane
            tabIndex={tab === name ? 0 : -1}
          >
            {content(name)}
          </div>
        ))}
      </div>
      <div
        className={styles.researchSources}
        tabIndex={0}
        aria-label="Research sources and availability"
      >
        {data ? (
          <>
            <span>
              {state?.failed
                ? "Previously observed research · Refresh unavailable"
                : data.refreshing
                  ? "Previously observed research · Refreshing"
                  : `${data.status === "partial" ? "Partial research" : "Observed research"}`}{" "}
              · {date(data.asOf)}
            </span>
            <br />
            {data.sources.slice(0, 3).map((source, index) => (
              <span key={source.url}>
                {index > 0 && " · "}
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.name}
                </a>
              </span>
            ))}
            {data.warnings.length > 0 && (
              <p>
                Some research data may be stale or unavailable. Open the full
                research for source details.
              </p>
            )}
          </>
        ) : (
          "Research is source-dependent. Missing data is never replaced with invented charts or figures."
        )}
      </div>
      <div className={styles.researchProgress} aria-hidden="true">
        <span data-story-progress />
      </div>
      <p className={styles.researchScrollHint}>
        {mode === "static"
          ? "Choose a view to explore the company."
          : "Scroll to change views. Or choose a tab."}
      </p>
    </div>
  );
}
