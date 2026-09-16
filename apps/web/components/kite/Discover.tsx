"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  ChevronRight,
  Database,
  Repeat2,
  ShieldCheck,
  Wallet2,
  RefreshCw,
  Info,
} from "lucide-react";
import { useKite } from "./State";
import { PageIntro } from "./Shell";
import { AssetTable, BasketCard, Empty, money, AssetAvatar } from "./MarketUI";
import { useBaskets } from "./useBaskets";
import { MarketPulse, MarketHeadlines, MarketBreadth } from "./MarketPulse";

export function MarketStatus() {
  const { snapshot, loading, error, refresh, storageError } = useKite();
  return (
    <>
      {storageError && (
        <div className="notice error" style={{ marginBottom: 18 }}>
          <Info size={15} />
          {storageError}
        </div>
      )}
      {error && (
        <div className="notice error" style={{ marginBottom: 18 }}>
          <Info size={15} />
          {error}
          <button onClick={() => void refresh()}>Retry</button>
        </div>
      )}
      {!error && snapshot?.status === "unavailable" && (
        <div className="notice" style={{ marginBottom: 18 }}>
          <Database size={15} />
          The market services are currently unavailable. No estimated prices are
          being shown.<button onClick={() => void refresh()}>Retry</button>
        </div>
      )}
      {!error && !snapshot?.refreshing && snapshot?.status === "partial" && (
        <div className="notice" style={{ marginBottom: 18 }}>
          <Info size={15} />
          Showing available live prices. Unpriced and paused assets remain in
          the catalog for reference.
          <button onClick={() => void refresh()}>Refresh</button>
        </div>
      )}
      {!loading && !error && snapshot?.refreshing && (
        <div className="notice" style={{ marginBottom: 18 }} role="status">
          <RefreshCw size={15} /> Updating market observations. You can explore
          assets and company research now.
        </div>
      )}
      {loading && (
        <div className="notice" style={{ marginBottom: 18 }} role="status">
          <RefreshCw size={15} /> Connecting to the xStocks and PreStocks
          mainnet catalogs…
        </div>
      )}
    </>
  );
}
export function PaperAccountCard() {
  const { paper, portfolio, hydrated, mode } = useKite();
  return (
    <div className="panel account-card">
      <div className="flex-between">
        <span className="eyebrow">
          {mode === "paper" ? "Your paper account" : "Your actual account"}
        </span>
        <Wallet2 size={17} className="muted" />
      </div>
      {mode === "paper" ? (
        <>
          <h2>{hydrated ? money(portfolio.totalUsd) : "—"}</h2>
          <p>Practice capital · real market prices</p>
          <div className="balance-breakdown">
            <div>
              <small>Available to invest</small>
              <strong>{money(paper.cashUsd)}</strong>
            </div>
            <div>
              <small>Invested</small>
              <strong>{money(portfolio.holdingsUsd)}</strong>
            </div>
          </div>
          <Link className="btn full secondary" href="/portfolio">
            View portfolio <ArrowUpRight size={14} />
          </Link>
          <p className="caption">
            Virtual USD only. Paper orders do not move funds onchain.
          </p>
        </>
      ) : (
        <>
          <h2>
            Your wallet.
            <br />
            Your assets.
          </h2>
          <p>
            Sign in with Privy or connect a Solana wallet to trade on mainnet.
          </p>
          <Link href="/settings" className="btn full" style={{ marginTop: 22 }}>
            Open account <ArrowUpRight size={14} />
          </Link>
        </>
      )}
    </div>
  );
}
export function Discover() {
  return (
    <Suspense
      fallback={
        <div className="notice" role="status">
          Opening Discover…
        </div>
      }
    >
      <DiscoverContent />
    </Suspense>
  );
}

function DiscoverContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedFilter = searchParams.get("filter") ?? "all";
  const filter = ["all", "xstocks", "backpack", "prestocks", "saved"].includes(
    requestedFilter,
  )
    ? requestedFilter
    : "all";
  const updateFilter = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("filter");
    else params.set("filter", next);
    router.replace(
      `/app${params.size ? `?${params.toString()}` : ""}#all-assets`,
      { scroll: false },
    );
  };
  const { snapshot, watchlist, toggleWatch, loading, mode, refresh } =
    useKite();
  const baskets = useBaskets();
  const assets = snapshot?.assets ?? [];
  return (
    <div className="discover-workspace">
      <div className="discover-heading">
        <div>
          <span className="eyebrow">Discover on Kite</span>
          <h1>Your next investment starts here.</h1>
          <p>Explore companies, follow the market, and find your next idea.</p>
        </div>
        <button
          type="button"
          className="btn secondary small"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Refresh prices
        </button>
      </div>
      <MarketStatus />
      <div className="discover-layout">
        <div className="discover-content">
          <MarketPulse />
          <section id="all-assets" className="discover-all-assets">
            <div className="section-head">
              <div>
                <h2>Stocks &amp; funds</h2>
                <p>
                  Explore the full catalog, from familiar companies to emerging
                  ideas.
                </p>
              </div>
              <span className="badge">
                {assets.length ? `${assets.length} ASSETS` : "CATALOG"}
              </span>
            </div>
            <AssetTable
              assets={assets}
              backpackSecurities={snapshot?.backpackSecurities}
              loading={loading}
              watchlist={watchlist}
              onWatch={toggleWatch}
              initialFilter={filter}
              onFilterChange={updateFilter}
            />
          </section>
          <section className="discover-themes">
            <div className="section-head">
              <div>
                <h2>Explore by theme</h2>
                <p>A few ways to connect the companies you believe in.</p>
              </div>
              <Link href="/baskets" className="text-link">
                All baskets <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <div className="discover-theme-list">
              {baskets.slice(0, 3).map((basket) => (
                <Link
                  href={`/basket/${basket.id}`}
                  className="discover-theme"
                  key={basket.id}
                >
                  <div className="mini-assets">
                    {basket.assets.slice(0, 3).map((asset) => (
                      <AssetAvatar
                        key={asset.mint}
                        asset={asset}
                        small
                        label={asset.name}
                      />
                    ))}
                  </div>
                  <h3>{basket.name}</h3>
                  <p>
                    {basket.assets.length} assets
                    <span aria-hidden="true"> · </span>
                    {basket.source.category || "Curated theme"}
                  </p>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        </div>
        <aside
          className="discover-rail"
          aria-label="Your account and market context"
        >
          <PaperAccountCard />
          <section className="panel discover-tools">
            <h3>Keep your investments moving</h3>
            <Link href={`/sip?mode=${mode}`}>
              <span className="discover-tool-icon">
                <Repeat2 size={18} aria-hidden="true" />
              </span>
              <span>
                <strong>Recurring investments</strong>
                <small>Set your amount and schedule</small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/portfolio">
              <span className="discover-tool-icon">
                <Wallet2 size={18} aria-hidden="true" />
              </span>
              <span>
                <strong>Portfolio &amp; activity</strong>
                <small>Your holdings and investment history</small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </section>
          <MarketBreadth />
          <MarketHeadlines />
          <div className="data-source">
            <ShieldCheck size={15} aria-hidden="true" />
            <p>
              Observed token prices, in USD.
              <br />
              Unreported prices are shown as —.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Kept for existing links; Discover now includes the full market catalog. */
export function Markets() {
  return <Discover />;
}
export function Baskets() {
  const baskets = useBaskets();
  const [category, setCategory] = useState("all");
  const categories = [
    ...new Set(
      baskets
        .map((basket) => basket.source.category)
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    ),
  ];
  const visible = baskets.filter(
    (basket) => category === "all" || basket.source.category === category,
  );
  return (
    <>
      <PageIntro
        eyebrow="Curated on Kite"
        title="An idea worth owning."
        description="A collection of assets behind a shared conviction. Explore the composition, then practice an allocation at live prices."
      />
      <MarketStatus />
      <div
        className="filter-tabs basket-filters"
        role="group"
        aria-label="Basket theme category"
      >
        {["all", ...categories].map((item) => (
          <button
            key={item}
            className={category === item ? "active" : ""}
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {item === "all"
              ? `All themes · ${baskets.length}`
              : item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <div className="basket-grid basket-catalog" style={{ marginBottom: 30 }}>
        {visible.map((b, i) => (
          <BasketCard key={b.id} basket={b} index={i} />
        ))}
      </div>
      <div className="panel panel-pad">
        <div className="flex-start">
          <ShieldCheck size={21} className="up" />
          <h3>Ownership, without a vault</h3>
        </div>
        <p
          className="muted"
          style={{
            fontSize: 13,
            lineHeight: 1.9,
            marginTop: 13,
            maxWidth: 770,
          }}
        >
          Baskets are curated allocations into individual assets. Paper
          purchases record each component in your demo portfolio. In actual
          trading, supported routes let you review one approval for the whole
          basket, with each asset delivered to your wallet. Kite does not mint a
          basket token or take custody of your funds.
        </p>
        <Link href="/sip" className="text-link" style={{ marginTop: 17 }}>
          Explore recurring investments <ChevronRight size={14} />
        </Link>
      </div>
    </>
  );
}
export function Watchlist() {
  const { snapshot, watchlist, toggleWatch } = useKite();
  const assets = (snapshot?.assets ?? []).filter((a) =>
    watchlist.includes(a.mint),
  );
  return (
    <>
      <PageIntro
        eyebrow="Saved for later"
        title="Keep your ideas close."
        description="Your own collection of companies to follow. Saved on this device, with prices refreshed from mainnet markets."
      />
      <MarketStatus />
      {assets.length ? (
        <AssetTable
          assets={assets}
          watchlist={watchlist}
          onWatch={toggleWatch}
        />
      ) : (
        <div className="panel">
          <Empty
            icon={Bookmark}
            title="Your watchlist starts with an idea"
            description="Bookmark any asset while exploring. It will appear here with its latest available price."
            action={
              <Link href="/app#all-assets" className="btn">
                Explore stocks <ArrowUpRight size={14} />
              </Link>
            }
          />
        </div>
      )}
    </>
  );
}
