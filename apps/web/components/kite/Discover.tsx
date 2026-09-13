"use client";
import Link from "next/link";
import { useState } from "react";
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
import {
  AssetTable,
  BasketCard,
  BasketDisplay,
  Empty,
  money,
  WatchRow,
} from "./MarketUI";
import { OrbitArt } from "./Brand";
import { useBaskets } from "./useBaskets";
import { MarketPulse, MarketHeadlines } from "./MarketPulse";

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
  const { snapshot, watchlist, toggleWatch, loading, mode } = useKite();
  const baskets = useBaskets();
  const assets = snapshot?.assets ?? [];
  const watched = assets.filter((a) => watchlist.includes(a.mint));
  return (
    <>
      <PageIntro
        eyebrow="An open world of ownership"
        title={
          <>
            Big ideas.
            <br className="hide-desktop" /> <em>Your next move.</em>
          </>
        }
        description="Explore a basket for your next investment, or choose a daily, weekly or monthly rhythm."
      />
      <MarketStatus />
      <div className="discover-grid">
        <div className="discover-primary">
          <section className="discovery-hero">
            <div className="hero-copy">
              <p className="eyebrow">Ideas, brought together</p>
              <h2>
                A whole theme.
                <br />
                One place to start.
              </h2>
              <p>
                Look inside a basket, see every holding, and choose how you want
                to invest. Practice first with virtual funds.
              </p>
              <div className="landing-actions" style={{ flexWrap: "wrap" }}>
                <Link href="/baskets" className="btn small">
                  Explore baskets <ArrowUpRight size={14} />
                </Link>
                <Link href={`/sip?mode=${mode}`} className="text-link">
                  Recurring plans <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
            <OrbitArt />
            <span className="hero-tag">
              CURATED ON KITE / SETTLED ON SOLANA
            </span>
          </section>
          <section>
            <div className="section-head">
              <h2>Invest in a point of view</h2>
              <Link href="/baskets" className="text-link">
                All baskets <ArrowRight size={14} />
              </Link>
            </div>
            <div className="basket-grid">
              {baskets.slice(0, 3).map((b, i) => (
                <BasketCard key={b.id} basket={b} index={i} />
              ))}
            </div>
          </section>
          <MarketPulse />
          <section>
            <div className="section-head">
              <div>
                <h2>A market without borders</h2>
                <p>
                  Issuer-listed equities, ETFs and pre-IPO exposure on Solana.
                </p>
              </div>
            </div>
            <AssetTable
              assets={assets}
              loading={loading}
              watchlist={watchlist}
              onWatch={toggleWatch}
              compact
            />
          </section>
          <MarketHeadlines />
        </div>
        <aside className="right-column">
          <PaperAccountCard />
          <div className="panel step-card">
            <span className="step-icon">
              <Repeat2 size={18} strokeWidth={1.5} />
            </span>
            <h3>
              Small steps.
              <br />
              Long-term thinking.
            </h3>
            <p>
              {mode === "paper"
                ? "Practice a recurring investment with virtual funds. Choose daily, weekly or monthly installments."
                : "Choose a basket or stock, set your schedule, and review the limits before authorizing future investments."}
            </p>
            <Link className="text-link" href={`/sip?mode=${mode}`}>
              Explore recurring plans <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="panel watch-card">
            <div className="flex-between">
              <h3 style={{ fontSize: 16 }}>On your radar</h3>
              <Link
                href="/watchlist"
                className="icon-btn"
                aria-label="Open watchlist"
              >
                <ArrowUpRight size={15} />
              </Link>
            </div>
            {watched.length ? (
              watched
                .slice(0, 4)
                .map((a) => <WatchRow key={a.mint} asset={a} />)
            ) : (
              <Empty
                icon={Bookmark}
                title="Follow your conviction"
                description="Save an asset to keep its latest price close."
              />
            )}
          </div>
          <div className="data-source">
            <ShieldCheck size={15} />
            <p>
              Prices from live market services.
              <br />
              Your assets stay in your wallet.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
export function Markets() {
  const { snapshot, watchlist, toggleWatch, refresh, loading } = useKite();
  return (
    <>
      <PageIntro
        eyebrow="Explore / Markets"
        title="Your world of possibilities."
        description="Browse the full available xStocks and PreStocks catalogs. Search by company, ticker or mint address."
      />
      <MarketStatus />
      <div className="section-head">
        <div className="flex-start">
          <span className="badge lime">
            {snapshot ? `${snapshot.assets.length} ASSETS` : "LOADING CATALOG"}
          </span>
        </div>
        <button className="btn secondary small" onClick={() => void refresh()}>
          <RefreshCw size={13} />
          Refresh data
        </button>
      </div>
      <AssetTable
        assets={snapshot?.assets ?? []}
        loading={loading}
        watchlist={watchlist}
        onWatch={toggleWatch}
      />
    </>
  );
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
              <Link href="/markets" className="btn">
                Explore markets <ArrowUpRight size={14} />
              </Link>
            }
          />
        </div>
      )}
    </>
  );
}
