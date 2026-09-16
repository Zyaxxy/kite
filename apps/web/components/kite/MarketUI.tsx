"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  Search,
  Layers3,
  Building2,
} from "lucide-react";
import { BackpackCatalog } from "./BackpackCatalog";
import type { BackpackSecurity, MarketAsset, MarketBasket } from "@kite/sdk";
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
}
export function BasketCard({
  basket,
  index = 0,
  tabIndex,
  prefetch,
  presentation = "app",
}: {
  basket: BasketDisplay;
  index?: number;
  tabIndex?: number;
  prefetch?: boolean;
  presentation?: "app" | "marketing";
}) {
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
            {presentation === "marketing"
              ? "Explore theme"
              : basket.available
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
