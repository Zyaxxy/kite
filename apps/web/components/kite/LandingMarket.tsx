"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { MarketAsset, MarketSnapshot } from "@kite/sdk";
import { AssetAvatar, Change, money } from "./MarketUI";
import styles from "./Landing.module.css";

function observedAt(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value)))
    return "Observation time unavailable";
  return `${new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
}

export function LandingMarket({
  assets,
  snapshot,
  loading,
}: {
  assets: MarketAsset[];
  snapshot: MarketSnapshot | null;
  loading: boolean;
}) {
  return (
    <section
      className={styles.marketRibbon}
      aria-labelledby="landing-market-title"
      data-landing-market
      data-motion-layout
    >
      <div className={styles.ribbonInner}>
        <div className={styles.ribbonHeading}>
          <div>
            <h2 id="landing-market-title">Market snapshot</h2>
            <p>Observed token prices in USD · 24-hour change</p>
          </div>
          <Link href="/markets" className={styles.ribbonLink}>
            Explore markets <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
        {assets.length ? (
          <div className={styles.quoteGrid}>
            {assets.map((asset) => (
              <Link
                key={asset.mint}
                href={`/stock/${encodeURIComponent(asset.mint)}`}
                className={styles.ticker}
                data-market-quote
              >
                <div className={styles.quoteIdentity}>
                  <AssetAvatar asset={asset} small label={asset.name} />
                  <span>
                    <strong>{asset.symbol}</strong>
                    <small title={asset.name}>
                      {asset.name.replace(/ xStock$/i, "")}
                    </small>
                  </span>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </div>
                <div className={styles.quoteNumbers}>
                  <strong>{money(asset.priceUsd)}</strong>
                  <Change value={asset.change24hPct} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className={styles.ribbonEmpty} role="status">
            {loading
              ? "Loading observed prices…"
              : "Prices temporarily unavailable. Explore the issuer catalog."}
          </p>
        )}
        {snapshot && (
          <p className={styles.ribbonTime}>
            {snapshot.status === "partial"
              ? "Partial market snapshot"
              : snapshot.status === "unavailable"
                ? "Market data unavailable"
                : "Latest available snapshot"}
            {" · "}
            {observedAt(snapshot.asOf)}
            {snapshot.warnings.length > 0 &&
              " · Some observations may be stale or unavailable"}
          </p>
        )}
      </div>
    </section>
  );
}
