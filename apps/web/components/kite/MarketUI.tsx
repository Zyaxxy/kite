"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  Search,
  Layers3,
  Building2,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";
import { BackpackCatalog } from "./BackpackCatalog";
import {
  formatSocialUrl,
  calculateBasket24hGrowth,
  type BackpackSecurity,
  type MarketAsset,
  type MarketBasket,
  type BasketPerformance,
} from "@kite/sdk";
import { basketPerformanceClient } from "./basket-performance-client";
import { OrbitArt } from "./Brand";
import { getCompanyLogo } from "../../lib/company-logos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { NativeSelect, NativeSelectOption } from "../ui/native-select";

export const money = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(value);
export const compactMoney = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
export function Change({ value }: { value: number | null | undefined }) {
  return (
    <span className={value == null ? "muted" : value >= 0 ? "up" : "down"}>
      {value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`}
    </span>
  );
}
import { AssetAvatar } from "./AssetAvatar";
export { AssetAvatar };

export function AssetName({ asset }: { asset: MarketAsset }) {
  return (
    <Link
      className="asset-name"
      href={`/stock/${encodeURIComponent(asset.mint)}`}
    >
      <AssetAvatar asset={asset} />
      <span className="asset-label">
        <strong>{asset.symbol}</strong>
        <small>
          {asset.tradingHalted ? "Trading paused · " : ""}
          {asset.name}
        </small>
      </span>
    </Link>
  );
}
export function Empty({
  icon: Icon = Layers3,
  title,
  description,
  action,
}: {
  icon?: typeof Layers3;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={23} strokeWidth={1.3} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function WatchRow({ asset }: { asset: MarketAsset }) {
  return (
    <div className="watch-row">
      <AssetName asset={asset} />
      <span className="watch-price">
        {money(asset.priceUsd)}
        <small>
          <Change value={asset.change24hPct} />
        </small>
      </span>
    </div>
  );
}
type AssetSort = "volume" | "gainers" | "losers" | "name";

/** Null observations always stay last; an unknown price is never treated as zero. */
function sortAssets(assets: MarketAsset[], sort: AssetSort): MarketAsset[] {
  return [...assets].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (a.tradingHalted !== b.tradingHalted) return a.tradingHalted ? 1 : -1;
    if ((a.priceUsd == null) !== (b.priceUsd == null))
      return a.priceUsd == null ? 1 : -1;
    const left = sort === "volume" ? a.volume24hUsd : a.change24hPct;
    const right = sort === "volume" ? b.volume24hUsd : b.change24hPct;
    if (left == null || right == null) {
      if (left == null && right == null) return a.name.localeCompare(b.name);
      return left == null ? 1 : -1;
    }
    return (
      (sort === "losers" ? left - right : right - left) ||
      a.name.localeCompare(b.name)
    );
  });
}

export function AssetTable({
  assets,
  watchlist,
  onWatch,
  initialFilter = "all",
  backpackSecurities = [],
  onFilterChange,
  compact = false,
  loading = false,
}: {
  assets: MarketAsset[];
  watchlist: string[];
  onWatch: (mint: string) => void;
  initialFilter?: string;
  backpackSecurities?: BackpackSecurity[];
  onFilterChange?: (filter: string) => void;
  compact?: boolean;
  loading?: boolean;
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AssetSort>("volume");
  const pageSize = compact ? 8 : 12;
  const [limit, setLimit] = useState(pageSize);
  useEffect(() => {
    setFilter(initialFilter);
    setLimit(pageSize);
  }, [initialFilter, pageSize]);
  const changeFilter = (next: string) => {
    setFilter(next);
    setLimit(pageSize);
    onFilterChange?.(next);
  };
  const filtered = sortAssets(
    assets.filter(
      (asset) =>
        (filter === "all" ||
          (filter === "xstocks" && asset.issuer === "xstocks") ||
          (filter === "prestocks" && asset.issuer === "prestocks") ||
          (filter === "etf" && asset.kind === "etf") ||
          (filter === "saved" && watchlist.includes(asset.mint))) &&
        `${asset.name} ${asset.symbol} ${asset.underlyingSymbol} ${asset.mint}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    ),
    sort,
  );
  const resetFilters = () => {
    changeFilter("all");
    setQuery("");
  };
  return (
    <div className="stock-catalog">
      <div className="stock-catalog-toolbar">
        <label className="market-input catalog-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search companies, symbols or mint addresses"
            placeholder="Search companies or symbols"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(pageSize);
            }}
          />
        </label>
        <NativeSelect
          disabled={filter === "backpack"}
          aria-label="Sort assets"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as AssetSort);
            setLimit(pageSize);
          }}
        >
          <NativeSelectOption value="volume">Most traded</NativeSelectOption>
          <NativeSelectOption value="gainers">Top gainers</NativeSelectOption>
          <NativeSelectOption value="losers">Top losers</NativeSelectOption>
          <NativeSelectOption value="name">Company A–Z</NativeSelectOption>
        </NativeSelect>
      </div>
      <div
        className="catalog-filters filter-tabs"
        role="group"
        aria-label="Asset category"
      >
        {[
          ["all", "All assets"],
          ["xstocks", "xStocks"],
          ["backpack", "Backpack"],
          ["prestocks", "PreStocks"],
          ["saved", "Saved"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={filter === id ? "active" : ""}
            aria-pressed={filter === id}
            onClick={() => changeFilter(id)}
          >
            {id === "saved" && <Bookmark size={13} aria-hidden="true" />}
            {label}
            {id === "saved" && watchlist.length > 0 && (
              <span>{watchlist.length}</span>
            )}
          </button>
        ))}
      </div>
      {filter === "backpack" ? (
        <BackpackCatalog
          securities={backpackSecurities}
          assets={assets}
          query={query}
          loading={loading}
        />
      ) : filtered.length ? (
        <>
          <Table
            className="assets-table catalog-table"
            aria-label="Available tokenized stocks and funds"
          >
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Company</TableHead>
                <TableHead scope="col" className="num">
                  Token price
                </TableHead>
                <TableHead scope="col" className="num catalog-change">
                  24h change
                </TableHead>
                <TableHead scope="col" className="num catalog-volume">
                  24h volume
                </TableHead>
                <TableHead scope="col" className="catalog-save">
                  <span className="sr-only">Save asset</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, limit).map((asset) => {
                const saved = watchlist.includes(asset.mint);
                return (
                  <TableRow key={asset.mint}>
                    <TableCell>
                      <Link
                        className="catalog-company"
                        href={`/stock/${encodeURIComponent(asset.mint)}`}
                      >
                        <AssetAvatar asset={asset} />
                        <span>
                          <strong>{asset.name.replace(/ xStock$/i, "")}</strong>
                          <small>
                            {asset.symbol}
                            <i aria-hidden="true">·</i>
                            {asset.tradingHalted
                              ? "Trading paused"
                              : asset.issuer === "xstocks"
                                ? "xStocks"
                                : asset.issuer === "prestocks"
                                  ? "PreStocks"
                                  : asset.issuer === "backpack"
                                    ? "Backpack"
                                    : "Tokenized"}
                          </small>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="num catalog-price">
                      <strong>
                        {asset.priceUsd == null ? "—" : money(asset.priceUsd)}
                      </strong>
                      {asset.priceUsd == null ? (
                        <small>Price unavailable</small>
                      ) : (
                        <small className="catalog-mobile-change">
                          <Change value={asset.change24hPct} />
                        </small>
                      )}
                    </TableCell>
                    <TableCell className="num catalog-change">
                      <Change value={asset.change24hPct} />
                    </TableCell>
                    <TableCell className="num catalog-volume muted">
                      {asset.volume24hUsd == null
                        ? "—"
                        : compactMoney(asset.volume24hUsd)}
                    </TableCell>
                    <TableCell className="num catalog-save">
                      <button
                        type="button"
                        className={`icon-btn ${saved ? "selected" : ""}`}
                        aria-label={`${saved ? "Remove" : "Save"} ${asset.symbol}${saved ? " from saved assets" : " to saved assets"}`}
                        aria-pressed={saved}
                        onClick={() => onWatch(asset.mint)}
                      >
                        <Bookmark
                          size={16}
                          fill={saved ? "currentColor" : "none"}
                          aria-hidden="true"
                        />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="market-count catalog-count">
            <span>
              {Math.min(filtered.length, limit)} of {filtered.length} assets ·
              USD
            </span>
            {filtered.length > limit && (
              <button
                type="button"
                className="text-link"
                onClick={() => setLimit((value) => value + pageSize)}
              >
                Show more <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      ) : loading ? (
        <div
          className="catalog-skeleton"
          role="status"
          aria-label="Loading market prices"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index}>
              <i />
              <span />
              <b />
            </div>
          ))}
          <span className="sr-only">
            Loading available companies and prices.
          </span>
        </div>
      ) : (
        <Empty
          icon={filter === "saved" ? Bookmark : Search}
          title={
            filter === "saved" && !query
              ? "Your ideas, saved here"
              : "No matching assets"
          }
          description={
            filter === "saved" && !query
              ? "Tap the bookmark beside a company to follow it from Discover."
              : "Try another company, symbol or category."
          }
          action={
            <button
              type="button"
              className="btn secondary small"
              onClick={resetFilters}
            >
              Browse all assets
            </button>
          }
        />
      )}
    </div>
  );
}
export interface BasketDisplay {
  id: string;
  name: string;
  description: string;
  assets: MarketAsset[];
  available: boolean;
  source: MarketBasket;
  isCustom?: boolean;
  creatorName?: string;
  creatorSocial?: string;
}
export function BasketCard({
  basket,
  index = 0,
  tabIndex,
  prefetch,
  presentation = "app",
  onInspectPerformance,
}: {
  basket: BasketDisplay;
  index?: number;
  tabIndex?: number;
  prefetch?: boolean;
  presentation?: "app" | "marketing";
  onInspectPerformance?: (basket: BasketDisplay) => void;
}) {
  const audit = basket.source.liquidityAudit;
  const totalVolume24h = basket.assets.reduce(
    (sum, a) => sum + (a.volume24hUsd ?? 0),
    0,
  );
  const growth24h = useMemo(() => calculateBasket24hGrowth(basket), [basket]);
  const [perf30d, setPerf30d] = useState<BasketPerformance | null>(() =>
    basketPerformanceClient.peek(basket.id, "30d"),
  );

  useEffect(() => {
    let active = true;
    const cached = basketPerformanceClient.peek(basket.id, "30d");
    if (cached) {
      setPerf30d(cached);
      return;
    }
    void basketPerformanceClient
      .load(basket, "30d")
      .then((res) => {
        if (active) setPerf30d(res);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [basket]);

  const displayPerf = perf30d ?? growth24h;
  const is1mLoaded = Boolean(perf30d);
  const changePct = displayPerf.changePct;
  const isPositive = (changePct ?? 0) >= 0;
  const pnlUsd = displayPerf.gainLossUsd;

  const creatorName = basket.creatorName || basket.source.creatorName;
  const creatorSocial = basket.creatorSocial || basket.source.creatorSocial;
  const formattedSocial = creatorSocial ? formatSocialUrl(creatorSocial) : undefined;

  return (
    <Link
      href={`/basket/${basket.id}`}
      className="basket-card"
      tabIndex={tabIndex}
      prefetch={prefetch}
    >
      <div className={`basket-art art-${index % 3}`}>
        <OrbitArt variant={index % 3} />
      </div>
      <div className="basket-card-body">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          {basket.source.category ? (
            <span className="eyebrow" style={{ margin: 0 }}>
              {basket.isCustom ? "User Created" : basket.source.category}
            </span>
          ) : <span />}
          {basket.isCustom ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 999,
                background: "rgba(99, 102, 241, 0.12)",
                color: "#818cf8",
                border: "1px solid rgba(99, 102, 241, 0.25)",
              }}
            >
              User Created
            </span>
          ) : audit ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 999,
                background:
                  audit.tier === "verified-high"
                    ? "rgba(16, 185, 129, 0.12)"
                    : audit.tier === "moderate"
                      ? "rgba(245, 158, 11, 0.12)"
                      : "rgba(239, 68, 68, 0.12)",
                color:
                  audit.tier === "verified-high"
                    ? "#10b981"
                    : audit.tier === "moderate"
                      ? "#f59e0b"
                      : "#ef4444",
                border: `1px solid ${
                  audit.tier === "verified-high"
                    ? "rgba(16, 185, 129, 0.25)"
                    : audit.tier === "moderate"
                      ? "rgba(245, 158, 11, 0.25)"
                      : "rgba(239, 68, 68, 0.25)"
                }`,
              }}
            >
              {audit.badgeLabel}
            </span>
          ) : null}
        </div>
        <h3>{basket.name}</h3>
        {creatorName && (
          <div
            className="basket-creator-row"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--muted)",
              marginTop: -2,
              marginBottom: 6,
            }}
          >
            <span>by</span>
            {formattedSocial ? (
              <span
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(formattedSocial, "_blank", "noopener,noreferrer");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(formattedSocial, "_blank", "noopener,noreferrer");
                  }
                }}
                style={{
                  color: "var(--accent, #6366f1)",
                  fontWeight: 600,
                  textDecoration: "underline",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
                title={`Visit ${creatorName}'s profile (${formattedSocial})`}
              >
                {creatorName}
                <ExternalLink size={10} style={{ opacity: 0.8 }} />
              </span>
            ) : (
              <span style={{ fontWeight: 600, color: "var(--ink)" }}>{creatorName}</span>
            )}
          </div>
        )}
        <div className="basket-growth-strip">
          <span
            className={`basket-growth-pill ${changePct == null ? "neutral" : isPositive ? "up" : "down"}`}
            title={`Basket ${is1mLoaded ? "1-month (30d)" : "24-hour"} return`}
          >
            {changePct == null ? (
              "—"
            ) : (
              <>
                {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {isPositive ? "+" : ""}{changePct.toFixed(2)}%
                <small style={{ marginLeft: 3, opacity: 0.85, fontWeight: 500 }}>
                  {is1mLoaded ? "1M" : "24h"}
                </small>
              </>
            )}
          </span>
          {pnlUsd != null && (
            <span
              className="basket-growth-pnl"
              title={`Hypothetical ${is1mLoaded ? "1-month (30d)" : "24h"} profit or loss on a standard $1,000 investment`}
            >
              <span className={isPositive ? "up" : "down"}>
                {pnlUsd >= 0 ? "+" : ""}${Math.abs(pnlUsd).toFixed(2)}
              </span>
              <small> on $1k</small>
            </span>
          )}
          {onInspectPerformance && (
            <button
              type="button"
              className="basket-perf-action-btn"
              title="Analyze performance across timeframes"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onInspectPerformance(basket);
              }}
            >
              <BarChart3 size={11} /> Performance
            </button>
          )}
        </div>
        <p>{basket.description}</p>
        <div className="mini-assets">
          {basket.assets.slice(0, 6).map((a) => (
            <AssetAvatar key={a.mint} asset={a} small label={a.name} />
          ))}
          {basket.assets.length > 6 && (
            <span
              className="mini-asset-count"
              aria-label={`${basket.assets.length - 6} more ${basket.assets.length === 7 ? "asset" : "assets"}`}
            >
              +{basket.assets.length - 6}
            </span>
          )}
        </div>
        <div className="basket-meta">
          <span>
            {basket.assets.length ? `${basket.assets.length} assets · ` : ""}
            {totalVolume24h > 0 ? `${compactMoney(totalVolume24h)} 24h vol · ` : ""}
            {presentation === "marketing"
              ? "Explore theme"
              : basket.available
                ? "Available on mainnet"
                : basket.source.missingSymbols.length
                  ? "Some components unavailable"
                  : "Some token prices unavailable"}
          </span>
          <ArrowRight size={14} />
        </div>
      </div>
    </Link>
  );
}
