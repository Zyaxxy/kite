"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
  GitFork,
  Share2,
  Trash2,
  Gauge,
  CheckCircle2,
  Scale,
  RefreshCw,
} from "lucide-react";
import { encodeBasketShareCode, calculateBasketRebalance, formatSocialUrl } from "@kite/sdk";
import { useKite } from "./State";
import type { MarketAsset } from "@kite/sdk";
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
import { BasketPerformancePanel } from "./BasketPerformancePanel";

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
  const router = useRouter();
  const basket = useBaskets().find((b) => b.id === id);
  const { paper, mode, tradeBasket, customBaskets, deleteCustomBasket, rebalancePaper } = useKite();
  const [amount, setAmount] = useState("100");
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);

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

  const isCustom = Boolean(basket.isCustom);
  const customConfig = customBaskets.find((cb) => cb.id === basket.id);
  const creatorName = basket.source.creatorName || customConfig?.creatorName;
  const creatorSocial = basket.source.creatorSocial || customConfig?.creatorSocial;
  const formattedSocial = creatorSocial ? formatSocialUrl(creatorSocial) : undefined;
  const audit = basket.source.liquidityAudit;

  const totalVolume24h = basket.assets.reduce(
    (sum, a) => sum + (a.volume24hUsd ?? 0),
    0,
  );

  const userHoldingsInBasket = basket.assets.map((a) => {
    const pos = paper.positions.find((p) => p.mint === a.mint);
    const price = a.priceUsd ?? 0;
    const valMicros = BigInt(Math.round((pos?.quantity ?? 0) * price * 1_000_000));
    return { mint: a.mint, valueUsdMicros: valMicros };
  });

  const totalHeldMicros = userHoldingsInBasket.reduce(
    (sum, h) => sum + h.valueUsdMicros,
    BigInt(0),
  );

  let driftAnalysis: {
    plan: ReturnType<typeof calculateBasketRebalance>;
    hasDrift: boolean;
  } | null = null;

  if (totalHeldMicros > BigInt(0)) {
    try {
      const plan = calculateBasketRebalance({
        targets: basket.source.assets.map((a) => ({
          mint: a.asset.mint,
          weightBps: Math.round(a.weight),
        })),
        holdings: userHoldingsInBasket,
        cashUsdMicros: BigInt(0),
        thresholdBps: customConfig?.rebalanceRules?.driftThresholdBps ?? 200,
      });
      const hasDrift = plan.legs.some((l) => l.action !== "hold");
      driftAnalysis = { plan, hasDrift };
    } catch {
      driftAnalysis = null;
    }
  }

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

  const handleShare = () => {
    if (!customConfig) return;
    const code = encodeBasketShareCode(customConfig);
    const url = `${window.location.origin}/basket/builder?import=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2500);
  };

  const handleDelete = () => {
    if (confirm(`Delete custom basket "${basket.name}"?`)) {
      deleteCustomBasket(basket.id);
      router.push("/baskets");
    }
  };

  const handleRebalance = () => {
    if (!customConfig) return;
    setRebalancing(true);
    try {
      rebalancePaper(customConfig);
    } finally {
      setRebalancing(false);
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <p className="eyebrow" style={{ margin: 0 }}>
                  {basket.source.category || (isCustom ? "Custom Allocation" : "A Kite Point of View")}
                </p>
                {audit && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 8px",
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
                    }}
                  >
                    {audit.badgeLabel}
                  </span>
                )}
                {isCustom && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "rgba(99, 102, 241, 0.12)",
                      color: "#818cf8",
                      border: "1px solid rgba(99, 102, 241, 0.25)",
                    }}
                  >
                    User Created
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Link
                  href={`/basket/builder?fork=${encodeURIComponent(basket.id)}`}
                  className="btn secondary small"
                  title="Fork this basket to customize allocations and components in Basket Builder"
                >
                  <GitFork size={13} /> Fork &amp; Customize
                </Link>
                {isCustom && customConfig && (
                  <>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={handleShare}
                      title="Copy basket share link"
                    >
                      {copiedShare ? <Check size={13} className="up" /> : <Share2 size={13} />}
                      {copiedShare ? "Copied" : "Share"}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={handleDelete}
                      title="Delete this custom basket"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <h1>{basket.name}</h1>
            {creatorName && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                  fontSize: 13,
                  color: "var(--muted)",
                }}
              >
                <span>Created by</span>
                {formattedSocial ? (
                  <a
                    href={formattedSocial}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--accent, #6366f1)",
                      fontWeight: 600,
                      textDecoration: "underline",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    title={`Visit ${creatorName}'s profile (${formattedSocial})`}
                  >
                    {creatorName}
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{creatorName}</span>
                )}
              </div>
            )}
            <p
              className="muted"
              style={{ marginTop: 15, maxWidth: 530, lineHeight: 1.8 }}
            >
              {basket.description}
            </p>
          </div>

          <BasketPerformancePanel basket={basket} />

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

          {/* Mainnet DEX Liquidity Audit Breakdown Card */}
          {audit && (
            <section className="panel panel-pad">
              <div className="section-head">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Gauge size={18} className={audit.tier === "verified-high" ? "up" : "muted"} />
                  <h3 style={{ margin: 0 }}>Mainnet DEX Liquidity Breakdown</h3>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 8px",
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
                  }}
                >
                  {audit.badgeLabel}
                </span>
              </div>

              <dl className="stats-grid" style={{ margin: "16px 0" }}>
                <div>
                  <dt>Execution Format</dt>
                  <dd style={{ color: "#10b981", display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={14} /> Atomic Solana V1
                  </dd>
                </div>
                <div>
                  <dt>Tested Roundtrip Loss</dt>
                  <dd>{(audit.testedRoundTripLossBps / 100).toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>Account Limit Margin</dt>
                  <dd>{audit.maxAccounts} / 64 max accounts</dd>
                </div>
                <div>
                  <dt>Combined 24h DEX Vol</dt>
                  <dd>{totalVolume24h > 0 ? compactMoney(totalVolume24h) : "Active pools"}</dd>
                </div>
              </dl>

              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(255, 255, 255, 0.03)",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                }}
              >
                <span className="eyebrow" style={{ fontSize: 10 }}>Routing Venues</span>
                <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>
                  {audit.liquidityVenueSummary}
                </p>
                <p className="fineprint" style={{ margin: "4px 0 0" }}>
                  {audit.description}
                </p>
              </div>

              {audit.recommendedAlternativeTicker && (
                <p className="fineprint" style={{ margin: "8px 0 0" }}>
                  Recommended alternative: <strong>{audit.recommendedAlternativeTicker}</strong>
                </p>
              )}
            </section>
          )}

          {/* Drift Analysis and 1-Click Rebalance for Custom Baskets */}
          {isCustom && customConfig && totalHeldMicros > BigInt(0) && driftAnalysis && (
            <section className="panel panel-pad">
              <div className="section-head">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Scale size={18} className={driftAnalysis.hasDrift ? "down" : "up"} />
                  <h3 style={{ margin: 0 }}>Target vs Actual Portfolio Drift</h3>
                </div>
                {mode === "paper" && driftAnalysis.hasDrift && (
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={handleRebalance}
                    disabled={rebalancing}
                  >
                    <RefreshCw size={13} className={rebalancing ? "spin" : ""} />
                    1-Click Rebalance
                  </button>
                )}
              </div>

              <p className="fineprint" style={{ margin: "8px 0 14px" }}>
                Total basket position value: {money(Number(totalHeldMicros) / 1_000_000)}. Rebalancing threshold: {(customConfig.rebalanceRules.driftThresholdBps / 100).toFixed(1)}%.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {driftAnalysis.plan.legs.map((leg) => {
                  const asset = basket.assets.find((a) => a.mint === leg.mint);
                  const driftBps = leg.currentWeightBps - leg.targetWeightBps;
                  return (
                    <div
                      key={leg.mint}
                      className="flex-between"
                      style={{
                        padding: "8px 12px",
                        background: "rgba(255, 255, 255, 0.02)",
                        borderRadius: 6,
                        border: "1px solid var(--line)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {asset && <AssetAvatar asset={asset} small />}
                        <strong>{asset?.symbol ?? leg.mint.slice(0, 4)}</strong>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 12 }}>
                          Current: {(leg.currentWeightBps / 100).toFixed(1)}% · Target: {(leg.targetWeightBps / 100).toFixed(1)}%
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 11,
                            fontWeight: 600,
                            color: Math.abs(driftBps) < 50 ? "var(--muted)" : driftBps > 0 ? "var(--up)" : "var(--down)",
                          }}
                        >
                          {driftBps > 0 ? `+${(driftBps / 100).toFixed(1)}% Overweight` : driftBps < 0 ? `${(driftBps / 100).toFixed(1)}% Underweight` : "Balanced"}
                          {leg.action !== "hold" && ` (${leg.action.toUpperCase()})`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="panel panel-pad">
            <div className="section-head">
              <h3>Inside the basket</h3>
              <span className="badge">
                {isCustom ? "Custom Weights" : "Equal weight"}
              </span>
            </div>
            {basket.assets.length ? (
              <ul className="composition">
                {basket.assets.map((asset) => (
                  <li key={asset.mint}>
                    <AssetName asset={asset} />
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ textAlign: "right", minWidth: 90 }}>
                        <span style={{ fontSize: 11, color: "var(--muted)", display: "block" }}>
                          {asset.liquidityUsd ? `${compactMoney(asset.liquidityUsd)} TVL` : "Pool active"} · {asset.volume24hUsd ? `${compactMoney(asset.volume24hUsd)} 24h` : "—"}
                        </span>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 65, fontSize: 12, fontWeight: 600 }}>
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
