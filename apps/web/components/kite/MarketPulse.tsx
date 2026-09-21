"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Newspaper, RefreshCw } from "lucide-react";
import { getMarketPulse } from "@kite/sdk";
import { AssetAvatar, Change, compactMoney, Empty, money } from "./MarketUI";
import { useKite } from "./State";

export function MarketPulse() {
  const { snapshot, loading } = useKite();
  const pulse = useMemo(
    () => getMarketPulse(snapshot?.assets ?? [], 4),
    [snapshot],
  );
  const [ranking, setRanking] = useState<"topVolume" | "gainers" | "losers">(
    "topVolume",
  );
  return (
    <section className="discover-movers" aria-label="Market movers">
      <div className="section-head">
        <div>
          <h2>Market movers</h2>
          <p>Follow the activity across tokenized assets.</p>
        </div>
        <span className="badge">24 HOURS</span>
      </div>
      <div
        className="filter-tabs mover-filters"
        role="group"
        aria-label="Market movers ranking"
      >
        {(
          [
            ["topVolume", "Most traded"],
            ["gainers", "Top gainers"],
            ["losers", "Top losers"],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={ranking === key ? "active" : ""}
            aria-pressed={ranking === key}
            onClick={() => setRanking(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {pulse[ranking].length ? (
        <div className="mover-cards">
          {pulse[ranking].map((asset) => (
            <Link
              className="mover-card"
              key={asset.mint}
              href={`/stock/${encodeURIComponent(asset.mint)}`}
            >
              <div className="mover-card-top">
                <AssetAvatar asset={asset} />
                <ArrowUpRight size={15} aria-hidden="true" />
              </div>
              <h3>{asset.name.replace(/ xStock$/i, "")}</h3>
              <span className="mover-symbol">{asset.symbol}</span>
              <strong className="mover-price">{money(asset.priceUsd)}</strong>
              <div className="mover-card-bottom">
                <Change value={asset.change24hPct} />
                <small>24h</small>
              </div>
            </Link>
          ))}
        </div>
      ) : loading ? (
        <div
          className="mover-cards"
          role="status"
          aria-label="Loading market movers"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div className="mover-card mover-skeleton" key={index}>
              <i />
              <span />
              <b />
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            icon={Activity}
            title="Market movers are unavailable"
            description="Rankings appear when prices, verified pool liquidity ($1,000+), and the selected 24h metric are available."
          />
        </div>
      )}
    </section>
  );
}

export function MarketBreadth() {
  const { snapshot } = useKite();
  const { breadth, volumeCoveredAssets } = useMemo(
    () => getMarketPulse(snapshot?.assets ?? []),
    [snapshot],
  );
  return (
    <section className="panel discover-breadth" aria-label="Market breadth">
      <div className="flex-between">
        <h3>Market breadth</h3>
        <Activity size={17} className="up" aria-hidden="true" />
      </div>
      <p>How assets moved in the last 24 hours</p>
      <div className="breadth-score">
        <strong>
          {breadth.advancingPct == null
            ? "—"
            : `${Math.round(breadth.advancingPct)}%`}
        </strong>
        <span>advancing</span>
      </div>
      <div
        className="breadth-track"
        role="img"
        aria-label={`${breadth.advancing} advancing, ${breadth.declining} declining, ${breadth.unchanged} unchanged of ${breadth.coveredAssets} assets with reported returns.`}
      >
        {breadth.coveredAssets > 0 && (
          <>
            <i
              className="advancing"
              style={{
                width: `${(breadth.advancing / breadth.coveredAssets) * 100}%`,
              }}
            />
            <i
              className="unchanged"
              style={{
                width: `${(breadth.unchanged / breadth.coveredAssets) * 100}%`,
              }}
            />
            <i
              className="declining"
              style={{
                width: `${(breadth.declining / breadth.coveredAssets) * 100}%`,
              }}
            />
          </>
        )}
      </div>
      <div className="breadth-key">
        <span>
          <i className="up-dot" />
          Advancing <b>{breadth.advancing}</b>
        </span>
        <span>
          <i className="down-dot" />
          Declining <b>{breadth.declining}</b>
        </span>
        <span>
          <i />
          Unchanged <b>{breadth.unchanged}</b>
        </span>
      </div>
      <small className="breadth-disclosure">
        Based on {breadth.coveredAssets} assets with reported returns. Volume
        covers {volumeCoveredAssets} assets.
      </small>
    </section>
  );
}

type Article = {
  title: string;
  source: string | null;
  link: string;
  pubDate: string | null;
};
export function MarketHeadlines() {
  const [state, setState] = useState<{
    articles: Article[];
    loading: boolean;
    error: boolean;
  }>({ articles: [], loading: true, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: false }));
    void fetch("/api/news?scope=market", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("News is unavailable");
        const data = (await response.json()) as { articles: Article[] };
        if (active)
          setState({
            articles: data.articles.slice(0, 5),
            loading: false,
            error: false,
          });
      })
      .catch(() => {
        if (active)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: true,
          }));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);
  return (
    <section className="panel discover-news">
      <div className="news-rail-heading">
        <div>
          <span className="eyebrow">In the headlines</span>
          <h3>Market news</h3>
        </div>
        <Newspaper size={19} className="muted" aria-hidden="true" />
      </div>
      {state.articles.length ? (
        <div className="news-rail-list">
          {state.articles.map((article) => (
            <a
              href={article.link}
              key={article.link}
              target="_blank"
              rel="noreferrer"
            >
              <div className="news-rail-meta">
                <span>{article.source || "Market news"}</span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </div>
              <h4>{article.title}</h4>
              <time dateTime={article.pubDate ?? undefined}>
                {article.pubDate
                  ? new Date(article.pubDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : "Date unavailable"}
              </time>
            </a>
          ))}
        </div>
      ) : state.loading ? (
        <div
          className="news-skeleton"
          role="status"
          aria-label="Loading market news"
        >
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index}>
              <small />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={Newspaper}
          title={
            state.error
              ? "News is temporarily unavailable"
              : "No recent headlines"
          }
          description={
            state.error
              ? "The news feed could not be reached. Try refreshing it."
              : "New stories will appear here when the feed updates."
          }
        />
      )}
      {state.error && state.articles.length > 0 && (
        <p className="news-refresh-note" role="status">
          Couldn’t refresh. Showing the last loaded stories.
        </p>
      )}
      <div className="news-rail-footer">
        <span>Source-linked reporting</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh market news"
          disabled={state.loading}
          onClick={() => setAttempt((count) => count + 1)}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
