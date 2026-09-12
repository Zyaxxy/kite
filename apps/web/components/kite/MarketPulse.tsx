"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, ArrowRight, Newspaper } from "lucide-react";
import { getMarketPulse } from "@kite/sdk";
import { AssetAvatar, Change, compactMoney, Empty, money } from "./MarketUI";
import { useKite } from "./State";

export function MarketPulse() {
  const { snapshot } = useKite();
  const pulse = useMemo(
    () => getMarketPulse(snapshot?.assets ?? [], 5),
    [snapshot],
  );
  const [ranking, setRanking] = useState<"topVolume" | "gainers" | "losers">(
    "topVolume",
  );
  const breadth = pulse.breadth;
  const tone =
    breadth.coveredAssets === 0
      ? "Awaiting market data"
      : breadth.advancing > breadth.declining
        ? "More assets advancing"
        : breadth.declining > breadth.advancing
          ? "More assets declining"
          : "A balanced market";
  return (
    <section className="market-pulse" aria-label="Market sentiment and movers">
      <div className="section-head">
        <div>
          <span className="eyebrow">The market, right now</span>
          <h2>Find the pulse.</h2>
        </div>
        <span className="badge">24 HOURS</span>
      </div>
      <div className="pulse-summary">
        <div className="panel pulse-breadth">
          <div className="flex-between">
            <span className="eyebrow">Market sentiment · breadth</span>
            <Activity size={16} className="up" />
          </div>
          <h3>{tone}</h3>
          <div
            className="breadth-track"
            role="img"
            aria-label={`${breadth.advancing} advancing, ${breadth.declining} declining, ${breadth.unchanged} unchanged of ${breadth.coveredAssets} assets with returns.`}
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
          <div className="breadth-labels">
            <span className="up">{breadth.advancing} advancing</span>
            <span>{breadth.unchanged} flat</span>
            <span className="down">{breadth.declining} declining</span>
          </div>
          <p>
            {breadth.coveredAssets} priced assets with a reported 24h change. A
            measure of market breadth, not a prediction.
          </p>
        </div>
        <div className="panel pulse-volume">
          <span className="eyebrow">Observed trading volume</span>
          <strong>{compactMoney(pulse.volume24hUsd)}</strong>
          <p>
            Across {pulse.volumeCoveredAssets} assets with reported token-market
            volume.
          </p>
          <div className="divider" />
          <div className="flex-between">
            <span>Token price coverage</span>
            <b>
              {pulse.pricedAssets} / {pulse.tradableAssets}
            </b>
          </div>
        </div>
      </div>
      <div className="panel pulse-leaders">
        <div className="pulse-leaders-head">
          <h3>Where the market is moving</h3>
          <div
            className="filter-tabs"
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
                key={key}
                className={ranking === key ? "active" : ""}
                aria-pressed={ranking === key}
                onClick={() => setRanking(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {pulse[ranking].length ? (
          <div className="leader-list">
            <div className="leader-columns">
              <span>Asset</span>
              <span>Token price / 24h</span>
              <span>24h volume</span>
            </div>
            {pulse[ranking].map((asset, index) => (
              <Link
                className="leader-row"
                key={asset.mint}
                href={`/stock/${encodeURIComponent(asset.mint)}`}
              >
                <span className="leader-asset">
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <AssetAvatar asset={asset} />
                  <span>
                    <strong>{asset.symbol}</strong>
                    <small>{asset.name}</small>
                    <small className="mobile-leader-volume">
                      Vol {compactMoney(asset.volume24hUsd)}
                    </small>
                  </span>
                </span>
                <span className="leader-price">
                  <strong>{money(asset.priceUsd)}</strong>
                  <Change value={asset.change24hPct} />
                </span>
                <span className="leader-volume">
                  {compactMoney(asset.volume24hUsd)}
                  <ArrowUpRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="Waiting for enough market data"
            description="Rankings appear only for assets with a reported price and the selected metric."
          />
        )}
        <div className="leader-footer">
          <span>
            Ranks use available onchain data; paused assets are excluded.
          </span>
          <Link href="/markets" className="text-link">
            All markets <ArrowRight size={13} />
          </Link>
        </div>
      </div>
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
            articles: data.articles.slice(0, 4),
            loading: false,
            error: false,
          });
      })
      .catch(() => {
        if (active) setState({ articles: [], loading: false, error: true });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);
  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Beyond the numbers</h2>
          <p>The latest market headlines, linked to their sources.</p>
        </div>
        <Newspaper size={18} className="muted" />
      </div>
      {state.articles.length ? (
        <div className="research-news dashboard-news">
          {state.articles.map((article) => (
            <a
              href={article.link}
              key={article.link}
              target="_blank"
              rel="noreferrer"
            >
              <div>
                <span className="eyebrow">
                  {article.source || "Market news"}
                </span>
                <ArrowUpRight size={16} />
              </div>
              <h3>{article.title}</h3>
              <time>
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
      ) : (
        <div className="panel">
          <Empty
            icon={Newspaper}
            title={
              state.loading
                ? "Finding the latest stories"
                : "Headlines are unavailable"
            }
            description={
              state.loading
                ? "Connecting to the news feed."
                : "No recent articles were returned. Check back or refresh the feed."
            }
            action={
              state.error ? (
                <button
                  className="btn secondary small"
                  onClick={() => setAttempt((count) => count + 1)}
                >
                  Retry headlines
                </button>
              ) : undefined
            }
          />
        </div>
      )}
    </section>
  );
}
