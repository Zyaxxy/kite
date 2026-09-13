"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  Search,
  Layers3,
  Building2,
} from "lucide-react";
import type { MarketAsset, MarketBasket } from "@kite/sdk";
import { OrbitArt } from "./Brand";
import { getCompanyLogo } from "../../lib/company-logos";

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
export function AssetAvatar({
  asset,
  large = false,
  small = false,
  label,
}: {
  asset: Pick<MarketAsset, "symbol" | "logoUrl"> &
    Partial<Pick<MarketAsset, "underlyingSymbol" | "issuer" | "mint">>;
  large?: boolean;
  small?: boolean;
  label?: string;
}) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const localLogo = getCompanyLogo(asset);
  const logoUrl = localLogo ?? asset.logoUrl;
  let optimizable = false;
  try {
    const url = new URL(logoUrl ?? "");
    optimizable =
      url.protocol === "https:" &&
      ["xstocks-metadata.backed.fi", "prestocks.com"].includes(url.hostname);
  } catch {
    /* Local logos are already compressed; remote logos use the allowed optimizer. */
  }
  return (
    <span
      className={`asset-avatar ${large ? "large" : small ? "small" : ""}`}
      title={label}
    >
      {logoUrl && failedLogo !== logoUrl ? (
        <Image
          width={64}
          height={64}
          unoptimized={!optimizable}
          sizes={small ? "32px" : "64px"}
          src={logoUrl}
          alt={label ?? ""}
          onError={() => setFailedLogo(logoUrl)}
          loading="lazy"
        />
      ) : small ? (
        <Building2
          size={14}
          role="img"
          aria-label={label ?? "Company logo unavailable"}
        />
      ) : (
        asset.symbol.slice(0, 3).toUpperCase()
      )}
    </span>
  );
}
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
export function AssetTable({
  assets,
  watchlist,
  onWatch,
  initialFilter = "all",
  compact = false,
  loading = false,
}: {
  assets: MarketAsset[];
  watchlist: string[];
  onWatch: (mint: string) => void;
  initialFilter?: string;
  compact?: boolean;
  loading?: boolean;
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(compact ? 6 : 20);
  const filtered = assets.filter(
    (a) =>
      (filter === "all" ||
        (filter === "xstocks" && a.issuer === "xstocks") ||
        (filter === "prestocks" && a.issuer === "prestocks") ||
        (filter === "etf" && a.kind === "etf")) &&
      `${a.name} ${a.symbol} ${a.mint}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="market-controls">
        <div className="filter-tabs" role="group" aria-label="Asset category">
          {[
            ["all", "All assets"],
            ["xstocks", "xStocks"],
            ["prestocks", "PreStocks"],
            ["etf", "ETFs"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? "active" : ""}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setLimit(compact ? 6 : 20);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="market-input">
          <Search size={13} />
          <input
            aria-label="Filter assets"
            placeholder="Find an asset"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(20);
            }}
          />
        </label>
      </div>
      {filtered.length ? (
        <>
          <table className="assets-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="hide-mobile">Issuer</th>
                <th className="num">Price</th>
                <th className="num">24h change</th>
                <th className="num hide-medium hide-mobile">24h volume</th>
                <th>
                  <span className="sr-only">Watchlist</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((a) => (
                <tr key={a.mint}>
                  <td>
                    <AssetName asset={a} />
                  </td>
                  <td className="hide-mobile">
                    <span className="badge">
                      {a.issuer === "xstocks"
                        ? "xStocks"
                        : a.issuer === "prestocks"
                          ? "PreStocks"
                          : "Tokenized"}
                    </span>
                  </td>
                  <td className="num">
                    {money(a.priceUsd)}
                    {a.priceUsd == null && a.underlyingPriceUsd != null && (
                      <small className="token-reference">
                        {money(a.underlyingPriceUsd)} underlying reference
                      </small>
                    )}
                  </td>
                  <td className="num">
                    <Change value={a.change24hPct} />
                  </td>
                  <td className="num hide-medium hide-mobile muted">
                    {compactMoney(a.volume24hUsd)}
                  </td>
                  <td className="num">
                    <button
                      className={`icon-btn ${watchlist.includes(a.mint) ? "selected" : ""}`}
                      aria-label={`${watchlist.includes(a.mint) ? "Remove" : "Add"} ${a.symbol} ${watchlist.includes(a.mint) ? "from" : "to"} watchlist`}
                      aria-pressed={watchlist.includes(a.mint)}
                      onClick={() => onWatch(a.mint)}
                    >
                      <Bookmark
                        size={15}
                        fill={
                          watchlist.includes(a.mint) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="market-count">
            <span>
              {Math.min(filtered.length, limit)} of {filtered.length} assets ·
              USD prices
            </span>
            {filtered.length > limit && (
              <button
                className="btn secondary small"
                onClick={() => setLimit((v) => v + 20)}
              >
                Load more <ArrowDownLeft size={12} />
              </button>
            )}
            {compact && (
              <Link className="text-link" href="/markets">
                All markets <ArrowUpRight size={13} />
              </Link>
            )}
          </div>
        </>
      ) : (
        <Empty
          icon={Search}
          title={loading ? "Connecting to the market" : "No assets found"}
          description={
            loading
              ? "Loading the latest issuer catalogs and available prices."
              : query
                ? "Try a different name, symbol or mint address."
                : "No assets in this category are available from the current market feed."
          }
        />
      )}
    </>
  );
}
export interface BasketDisplay {
  id: string;
  name: string;
  description: string;
  assets: MarketAsset[];
  available: boolean;
  source: MarketBasket;
}
export function BasketCard({
  basket,
  index = 0,
}: {
  basket: BasketDisplay;
  index?: number;
}) {
  return (
    <Link href={`/basket/${basket.id}`} className="basket-card">
      <div className={`basket-art art-${index % 3}`}>
        <OrbitArt variant={index % 3} />
      </div>
      <div className="basket-card-body">
        {basket.source.category && (
          <span className="eyebrow">{basket.source.category}</span>
        )}
        <h3>{basket.name}</h3>
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
            {basket.available
              ? "Available to practice"
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
