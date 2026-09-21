"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  ExternalLink,
  Info,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
} from "lucide-react";
import type { MarketAsset } from "@kite/sdk";
import { useKite } from "./State";
import {
  AssetAvatar,
  AssetName,
  Change,
  compactMoney,
  Empty,
  money,
} from "./MarketUI";
import { MarketStatus } from "./Discover";
import { OrbitArt } from "./Brand";
import { ActualBasketPanel } from "../trading/ActualBasketPanel";
import { ActualTradePanel } from "../trading/ActualTradePanel";
import { useBaskets } from "./useBaskets";
import { StockResearchPanel } from "./StockResearch";
import { PaperSwap } from "./PaperSwap";
import { researchClient } from "./research-client";

export function PaperTrade({ asset }: { asset: MarketAsset }) {
  const { paper, trade, swap, snapshot, hydrated, accountReadFailed } =
    useKite();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("100");
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount);
  const quantity = asset.priceUsd ? value / asset.priceUsd : null;
  const position = paper.positions.find((p) => p.mint === asset.mint);
  const submit = () => {
    setError(null);
    try {
      if (!review) {
        if (!Number.isFinite(value) || value <= 0)
          throw new Error("Enter a positive amount in USD.");
        if (side === "buy" && value > paper.cashUsd)
          throw new Error("This amount exceeds your paper cash balance.");
        if (
          side === "sell" &&
          (!position ||
            !asset.priceUsd ||
            value > position.quantity * asset.priceUsd + 0.00001)
        )
          throw new Error("This amount exceeds your paper holding.");
        setReview(true);
        return;
      }
      trade(asset, side, value);
      setReview(false);
      setAmount("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to record paper order.",
      );
      setReview(false);
    }
  };
  return (
    <>
      {asset.tradingHalted && (
        <div className="notice error" style={{ marginTop: 15 }}>
          {asset.tradingNotice ??
            "The issuer has paused this asset. Paper trading is disabled."}
        </div>
      )}
      <div
        className="filter-tabs"
        role="group"
        aria-label="Paper order side"
        style={{ margin: "18px 0" }}
      >
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            className={side === s ? "active" : ""}
            aria-pressed={side === s}
            onClick={() => {
              setSide(s);
              setReview(false);
              setError(null);
            }}
          >
            {s === "buy" ? "Buy" : "Sell"} {asset.symbol}
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor="paper-amount">
        <span>{review ? "Review your paper order" : "Amount"}</span>
        <span>Virtual USD</span>
      </label>
      <div className="amount-field">
        <input
          id="paper-amount"
          inputMode="decimal"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          value={amount}
          readOnly={review}
          onChange={(e) => {
            setAmount(e.target.value);
            setReview(false);
            setError(null);
          }}
        />
        <span>USD</span>
      </div>
      {!review && (
        <div className="amount-presets">
          {[25, 100, 250].map((v) => (
            <button key={v} onClick={() => setAmount(String(v))}>
              ${v}
            </button>
          ))}
          <button
            onClick={() =>
              setAmount(
                String(
                  Math.floor(
                    (side === "buy"
                      ? paper.cashUsd
                      : (position?.quantity ?? 0) * (asset.priceUsd ?? 0)) *
                      100,
                  ) / 100,
                ),
              )
            }
          >
            Max
          </button>
        </div>
      )}
      <div className="trade-summary">
        <div>
          <span>Current reference price</span>
          <span>{money(asset.priceUsd)}</span>
        </div>
        <div>
          <span>Estimated paper units</span>
          <span>
            {quantity != null && Number.isFinite(quantity)
              ? quantity.toFixed(6)
              : "—"}
          </span>
        </div>
        <div>
          <span>
            {side === "buy" ? "Available paper cash" : "Paper units held"}
          </span>
          <span>
            {side === "buy"
              ? money(paper.cashUsd)
              : (position?.quantity ?? 0).toFixed(6)}
          </span>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      <button
        className="btn full"
        onClick={submit}
        disabled={
          !hydrated ||
          accountReadFailed ||
          asset.tradingHalted ||
          !asset.priceUsd ||
          !(value > 0)
        }
      >
        {review ? (
          <>
            <Check size={15} />
            Confirm paper {side}
          </>
        ) : (
          <>
            Review paper {side}
            <ArrowUpRight size={15} />
          </>
        )}
      </button>
      {review && (
        <button className="btn ghost full" onClick={() => setReview(false)}>
          Edit order
        </button>
      )}
      <p className="fineprint">
        Simulated execution at the latest available reference price. No fees or
        slippage are simulated, and no real tokens move. Paper units are for the
        demo; actual xStocks may use scaled token units.
      </p>
      <PaperSwap
        asset={asset}
        assets={snapshot?.assets ?? []}
        account={paper}
        onSwap={swap}
        disabled={!hydrated || accountReadFailed}
      />
    </>
  );
}
export function StockDetail({ symbol }: { symbol: string }) {
  useEffect(() => {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbol)) return;
    const controller = new AbortController();
    // Begin the underlying lookup on navigation, independently of price hydration.
    void researchClient.load(symbol, controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [symbol]);
  const { snapshot, mode, setMode, watchlist, toggleWatch } = useKite();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "actual")
      setMode("actual");
  }, [setMode]);
  const asset = snapshot?.assets.find(
    (a) => a.mint === symbol || a.symbol.toLowerCase() === symbol.toLowerCase(),
  );
  if (!asset)
    return (
      <>
        <Link href="/markets" className="back-link">
          <ArrowLeft size={14} />
          Back to markets
        </Link>
        <MarketStatus />
        <div className="panel">
          <Empty
            title={snapshot ? "Asset not available" : "Finding your asset"}
            description={
              snapshot
                ? "This asset is not in the current verified mainnet catalog. Browse the markets for available assets."
                : "Loading the live issuer catalog and the latest available prices."
            }
            action={
              <Link href="/markets" className="btn secondary">
                Explore markets
              </Link>
            }
          />
        </div>
      </>
    );

  const isLowLiquidity =
    asset.liquidityUsd !== null &&
    asset.liquidityUsd !== undefined &&
    Number.isFinite(asset.liquidityUsd) &&
    asset.liquidityUsd < 1000;

  const priceDivergencePct =
    asset.priceUsd != null &&
    asset.underlyingPriceUsd != null &&
    asset.underlyingPriceUsd > 0
      ? (Math.abs(asset.priceUsd - asset.underlyingPriceUsd) /
          asset.underlyingPriceUsd) *
        100
      : null;

  const isSignificantDivergence =
    priceDivergencePct !== null && priceDivergencePct >= 10;

  const isPremium =
    priceDivergencePct !== null && asset.priceUsd! > asset.underlyingPriceUsd!;

  return (
    <>
      <Link href="/markets" className="back-link">
        <ArrowLeft size={14} />
        Back to markets
      </Link>
      <MarketStatus />
      <div className="detail-grid">
        <div>
          <div className="flex-between" style={{ marginBottom: 22 }}>
            <div className="detail-title" style={{ margin: 0 }}>
              <AssetAvatar asset={asset} large />
              <div>
                <h1>{asset.name}</h1>
                <p>
                  {asset.symbol} <span style={{ margin: "0 8px" }}>·</span>{" "}
                  {asset.issuer === "xstocks"
                    ? "xStocks"
                    : asset.issuer === "prestocks"
                      ? "PreStocks"
                      : "Tokenized equity"}
                </p>
              </div>
            </div>
            <button
              className={`icon-btn ${watchlist.includes(asset.mint) ? "selected" : ""}`}
              aria-label={`${watchlist.includes(asset.mint) ? "Remove from" : "Add to"} watchlist`}
              aria-pressed={watchlist.includes(asset.mint)}
              onClick={() => toggleWatch(asset.mint)}
            >
              <Bookmark
                size={18}
                fill={watchlist.includes(asset.mint) ? "currentColor" : "none"}
              />
            </button>
          </div>
          <div className="quote-space">
            <OrbitArt />
            <div className="quote-space-content">
              <div className="quote-live">
                <span className="status-dot" />
                {asset.priceUsd
                  ? "Latest available market price"
                  : "Price currently unavailable"}
              </div>
              <div className="detail-price">{money(asset.priceUsd)}</div>
              <div className="detail-price-caption">
                <Change value={asset.change24hPct} />
                <span className="muted">past 24 hours</span>
              </div>
              {asset.underlyingPriceUsd != null && (
                <div
                  className="quote-reference"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "6px 8px",
                    marginTop: 10,
                  }}
                >
                  <span>
                    Underlying share: <strong>{money(asset.underlyingPriceUsd)}</strong>
                  </span>
                  {isSignificantDivergence && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        padding: "1px 7px",
                        borderRadius: 9999,
                        background: isPremium ? "rgba(245, 158, 11, 0.12)" : "rgba(59, 130, 246, 0.12)",
                        border: `1px solid ${isPremium ? "rgba(245, 158, 11, 0.3)" : "rgba(59, 130, 246, 0.3)"}`,
                        color: isPremium ? "#fbbf24" : "#60a5fa",
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {isPremium ? `+${priceDivergencePct!.toFixed(1)}% Premium` : `-${priceDivergencePct!.toFixed(1)}% Discount`}
                    </span>
                  )}
                  {asset.isRealTimePyth ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "1px 7px",
                        borderRadius: 9999,
                        background: "rgba(16, 185, 129, 0.12)",
                        border: "1px solid rgba(16, 185, 129, 0.25)",
                        color: "#10b981",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.02em",
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: "#10b981",
                        }}
                      />
                      Pyth Real-Time
                    </span>
                  ) : asset.underlyingPriceSource === "jupiter-stock-data" ? (
                    <span className="muted" style={{ fontSize: 11 }}>
                      (via xStocks)
                    </span>
                  ) : (
                    <span className="muted" style={{ fontSize: 11 }}>
                      (via Pyth)
                    </span>
                  )}
                  {asset.underlyingConfidenceUsd ? (
                    <span className="muted" style={{ fontSize: 11 }}>
                      ±$
                      {asset.underlyingConfidenceUsd < 0.01
                        ? asset.underlyingConfidenceUsd.toFixed(4)
                        : asset.underlyingConfidenceUsd.toFixed(2)}
                    </span>
                  ) : null}
                  {asset.underlyingPriceUpdatedAt ? (
                    <span className="muted" style={{ fontSize: 11 }}>
                      ·{" "}
                      {new Date(asset.underlyingPriceUpdatedAt).toLocaleTimeString(
                        [],
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </span>
                  ) : null}
                  <span className="muted" style={{ fontSize: 11 }}>
                    · Token units and prices may differ.
                  </span>
                </div>
              )}
            </div>
            <p className="quote-note">
              {asset.priceObservedAt
                ? `Price observed ${new Date(asset.priceObservedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. `
                : "Awaiting a market quote. "}
              Reference prices are indicative. Your executable quote may differ.
            </p>
          </div>
          {/* Safeguard Warning Banners */}
          {isSignificantDivergence && (
            <div
              className="notice warning"
              role="alert"
              style={{
                margin: "16px 0 12px",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "14px 18px",
                borderRadius: 12,
                border: "1px solid rgba(245, 158, 11, 0.4)",
                background: "rgba(245, 158, 11, 0.08)",
                color: "#fbbf24",
              }}
            >
              <AlertTriangle size={18} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <strong style={{ color: "#fbbf24", display: "block", fontSize: 13, marginBottom: 4 }}>
                  Price Discrepancy Warning ({priceDivergencePct!.toFixed(1)}% {isPremium ? "Premium" : "Discount"})
                </strong>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--ink)", opacity: 0.9 }}>
                  This on-chain token is trading at {money(asset.priceUsd)}, which diverges significantly from the underlying share price ({money(asset.underlyingPriceUsd)}). On-chain AMM pool prices on Solana may be distorted due to low liquidity or depegging.
                </p>
              </div>
            </div>
          )}
          {isLowLiquidity && (
            <div
              className="notice error"
              role="alert"
              style={{
                margin: isSignificantDivergence ? "8px 0 12px" : "16px 0 12px",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "14px 18px",
                borderRadius: 12,
                border: "1px solid rgba(243, 165, 155, 0.4)",
                background: "rgba(243, 165, 155, 0.08)",
                color: "var(--down)",
              }}
            >
              <AlertOctagon size={18} style={{ color: "var(--down)", flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <strong style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
                  Low Pool Liquidity Warning ({compactMoney(asset.liquidityUsd)} TVL)
                </strong>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--ink)", opacity: 0.9 }}>
                  The on-chain AMM pool on Solana has very little depth. Swaps or market orders will experience severe slippage and price impact.
                </p>
              </div>
            </div>
          )}
          <dl className="stats-grid">
            {asset.underlyingPriceUsd != null && (
              <div>
                <dt style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>Underlying price</span>
                  {asset.isRealTimePyth ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: "rgba(16, 185, 129, 0.12)",
                        border: "1px solid rgba(16, 185, 129, 0.25)",
                        color: "#10b981",
                        fontSize: 9,
                        fontWeight: 600,
                      }}
                    >
                      <span
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "#10b981",
                        }}
                      />
                      Pyth
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>
                      (Pyth)
                    </span>
                  )}
                </dt>
                <dd>
                  {money(asset.underlyingPriceUsd)}
                  {asset.underlyingConfidenceUsd ? (
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--muted)",
                        fontWeight: 400,
                        marginLeft: 4,
                      }}
                    >
                      ±$
                      {asset.underlyingConfidenceUsd < 0.01
                        ? asset.underlyingConfidenceUsd.toFixed(4)
                        : asset.underlyingConfidenceUsd.toFixed(2)}
                    </span>
                  ) : null}
                </dd>
              </div>
            )}
            <div>
              <dt>24h trading volume</dt>
              <dd>{compactMoney(asset.volume24hUsd)}</dd>
            </div>
            <div>
              <dt style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Market liquidity</span>
                {isLowLiquidity && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      color: "var(--down)",
                    }}
                  >
                    Low
                  </span>
                )}
              </dt>
              <dd style={isLowLiquidity ? { color: "var(--down)" } : undefined}>
                {compactMoney(asset.liquidityUsd)}
              </dd>
            </div>
            <div>
              <dt>Asset type</dt>
              <dd>
                {asset.kind === "pre-ipo"
                  ? "Pre-IPO"
                  : asset.kind === "etf"
                    ? "ETF"
                    : asset.kind === "equity"
                      ? "Equity"
                      : "Tokenized asset"}
              </dd>
            </div>
          </dl>
          <StockResearchPanel key={asset.mint} asset={asset} />
          <div className="panel panel-pad">
            <h3>Know what you own</h3>
            <p
              className="muted"
              style={{ fontSize: 12, lineHeight: 1.9, marginTop: 12 }}
            >
              {asset.issuer === "prestocks"
                ? "PreStocks provide tokenized exposure to private companies. They are distinct from directly owning company shares; review the issuer’s structure, eligibility and disclosures before trading."
                : "This is a tokenized asset on Solana. Rights, availability, trading restrictions and redemption terms are defined by the issuer. A token is distinct from direct ownership of the underlying share."}
            </p>
            <div className="divider" />
            <span className="eyebrow">Verified mainnet mint</span>
            <p className="address" style={{ marginTop: 9 }}>
              {asset.mint}
            </p>
            <div
              className="flex-start"
              style={{ marginTop: 16, flexWrap: "wrap" }}
            >
              <a
                href={`https://solscan.io/token/${asset.mint}`}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                View on Solscan <ExternalLink size={12} />
              </a>
              <a
                href={
                  asset.issuer === "prestocks"
                    ? "https://prestocks.com"
                    : "https://xstocks.com"
                }
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Issuer details <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
        <aside>
          <div className="panel trade-panel">
            <h2>Make your move.</h2>
            <p className="muted" style={{ fontSize: 11 }}>
              Invest in {asset.symbol} on your terms.
            </p>
            {(isSignificantDivergence || isLowLiquidity) && !asset.tradingHalted && (
              <div
                className="notice warning"
                style={{
                  margin: "12px 0",
                  padding: "10px 14px",
                  fontSize: 11,
                  lineHeight: 1.4,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  borderRadius: 8,
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  background: "rgba(245, 158, 11, 0.08)",
                  color: "#fbbf24",
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>
                  {isSignificantDivergence
                    ? `Caution: Token trades at a ${priceDivergencePct!.toFixed(1)}% ${isPremium ? "premium" : "discount"} over the real share.`
                    : "Caution: Pool has low liquidity; large orders may slip."}
                </span>
              </div>
            )}
            {mode === "paper" ? (
              <PaperTrade asset={asset} />
            ) : asset.tradingHalted ? (
              <div className="notice error">
                {asset.tradingNotice ??
                  "The issuer has paused trading for this asset."}
              </div>
            ) : (
              <ActualTradePanel asset={asset} />
            )}
            <div className="divider" />
            <Link
              href={`/sip?stock=${asset.mint}&mode=${mode}`}
              className="text-link"
            >
              {mode === "paper"
                ? "Create a recurring paper plan"
                : "Set up recurring investment"}
              <ArrowUpRight size={13} />
            </Link>
            <div
              className="data-source"
              style={{
                padding: "20px 0 0",
                marginTop: 20,
                borderTop: "1px solid var(--line)",
              }}
            >
              <ShieldCheck size={15} />
              <p>
                {mode === "paper"
                  ? "Paper mode uses virtual funds."
                  : "Mainnet swaps go straight to your wallet."}
                <br />
                No Kite vault.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
export function BasketDetail({ id }: { id: string }) {
  const basket = useBaskets().find((b) => b.id === id);
  const { paper, mode, tradeBasket } = useKite();
  const [amount, setAmount] = useState("100");
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!basket)
    return (
      <Empty
        title="Basket unavailable"
        description="Explore the available thematic baskets."
        action={
          <Link href="/baskets" className="btn">
            Explore baskets
          </Link>
        }
      />
    );
  const submit = () => {
    setError(null);
    try {
      if (!review) {
        if (!(Number(amount) > 0) || Number(amount) > paper.cashUsd)
          throw new Error(
            "Enter an amount within your available paper balance.",
          );
        setReview(true);
        return;
      }
      tradeBasket(basket.source, Number(amount));
      setReview(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paper purchase failed.");
      setReview(false);
    }
  };
  return (
    <>
      <Link href="/baskets" className="back-link">
        <ArrowLeft size={14} />
        All thematic baskets
      </Link>
      <MarketStatus />
      <div className="detail-grid">
        <div className="stack">
          <div>
            <p className="eyebrow" style={{ marginBottom: 13 }}>
              A Kite point of view
            </p>
            <h1>{basket.name}</h1>
            <p
              className="muted"
              style={{ marginTop: 15, maxWidth: 530, lineHeight: 1.8 }}
            >
              {basket.description}
            </p>
          </div>
          <div className="discovery-hero" style={{ minHeight: 210 }}>
            <div className="hero-copy">
              <p className="eyebrow">The composition</p>
              <h2>
                {basket.assets.length} assets.
                <br />A shared direction.
              </h2>
              <p>Equal allocations. Individual ownership.</p>
            </div>
            <OrbitArt />
          </div>
          <section className="panel panel-pad">
            <div className="section-head">
              <h3>Inside the basket</h3>
              <span className="badge">Equal weight</span>
            </div>
            {basket.assets.length ? (
              <ul className="composition">
                {basket.assets.map((asset) => (
                  <li key={asset.mint}>
                    <AssetName asset={asset} />
                    <div style={{ textAlign: "right", fontSize: 12 }}>
                      {(
                        (basket.source.assets.find(
                          (a) => a.asset.mint === asset.mint,
                        )?.weight ?? 0) / 100
                      ).toFixed(2)}
                      %
                      <div className="allocation-bar">
                        <i
                          style={{
                            width: `${(basket.source.assets.find((a) => a.asset.mint === asset.mint)?.weight ?? 0) / 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                title="Catalog still loading"
                description="Basket components are resolved against the issuer’s live mainnet catalog."
              />
            )}
            <p className="fineprint">
              Composition is curated by Kite. No historical basket return or
              yield is implied.
            </p>
            {basket.source.missingSymbols.length > 0 && (
              <p className="fineprint">
                Not currently in the issuer catalog:{" "}
                {basket.source.missingSymbols.join(", ")}. The target allocation
                is preserved until every component is available.
              </p>
            )}
            {!!basket.source.unpricedSymbols?.length && (
              <p className="fineprint">
                Awaiting token-market prices for{" "}
                {basket.source.unpricedSymbols.join(", ")}. Underlying share
                references cannot be used for paper fills.
              </p>
            )}
          </section>
        </div>
        <aside>
          <div className="panel trade-panel">
            <h2>Own the idea.</h2>
            <p className="muted" style={{ fontSize: 11, marginTop: 5 }}>
              Allocate across this basket’s components.
            </p>
            {mode === "paper" ? (
              <>
                <label className="field-label" htmlFor="basket-amount">
                  Total paper allocation
                </label>
                <div className="amount-field">
                  <input
                    id="basket-amount"
                    inputMode="decimal"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    readOnly={review}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <span>USD</span>
                </div>
                <div className="trade-summary">
                  <div>
                    <span>Available virtual cash</span>
                    <span>{money(paper.cashUsd)}</span>
                  </div>
                  <div>
                    <span>Approx. per component</span>
                    <span>
                      {basket.assets.length
                        ? money(Number(amount) / basket.assets.length)
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span>Assets</span>
                    <span>{basket.assets.length}</span>
                  </div>
                </div>
                {error && (
                  <div
                    className="notice error"
                    role="alert"
                    style={{ marginBottom: 15 }}
                  >
                    {error}
                  </div>
                )}
                <button
                  className="btn full"
                  disabled={!basket.available || !(Number(amount) > 0)}
                  onClick={submit}
                >
                  {review
                    ? "Confirm paper allocation"
                    : "Review paper allocation"}
                  <ArrowUpRight size={14} />
                </button>
                {review && (
                  <button
                    className="btn ghost full"
                    onClick={() => setReview(false)}
                  >
                    Edit allocation
                  </button>
                )}
                <p className="fineprint">
                  Each component creates an individual simulated buy at its
                  latest reference price. Your virtual funds stay unchanged if
                  any component is unavailable.
                </p>
              </>
            ) : (
              <ActualBasketPanel basket={basket.source} />
            )}
            <div className="divider" />
            <Link href={`/sip?basket=${id}&mode=${mode}`} className="text-link">
              {mode === "paper"
                ? "Create a recurring paper plan"
                : "Set up recurring investment"}{" "}
              <ArrowUpRight size={13} />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
