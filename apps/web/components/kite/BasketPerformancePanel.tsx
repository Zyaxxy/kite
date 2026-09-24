"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Sparkles,
  Info,
  RefreshCw,
  Award,
  AlertCircle,
  X,
  DollarSign,
  ShieldCheck,
} from "lucide-react";
import {
  calculateBasket24hGrowth,
  type BasketPerformance,
  type BasketTimeframe,
  type MarketBasket,
} from "@kite/sdk";
import { AssetAvatar, money, compactMoney } from "./MarketUI";
import type { BasketDisplay } from "./MarketUI";

import { basketPerformanceClient } from "./basket-performance-client";

const TIMEFRAMES: { id: BasketTimeframe; label: string; periodLabel: string }[] = [
  { id: "30d", label: "1M", periodLabel: "Past 30 days (1 Month)" },
  { id: "7d", label: "7D", periodLabel: "Past 7 days" },
  { id: "24h", label: "24H", periodLabel: "Past 24 hours" },
  { id: "90d", label: "3M", periodLabel: "Past 90 days" },
  { id: "1y", label: "1Y", periodLabel: "Past 1 year" },
  { id: "ytd", label: "YTD", periodLabel: "Year to date" },
];

const PRESET_AMOUNTS = [100, 500, 1000, 5000];

export function BasketPerformancePanel({
  basket,
  defaultTimeframe = "30d",
  compact = false,
  onClose,
}: {
  basket: BasketDisplay | MarketBasket;
  defaultTimeframe?: BasketTimeframe;
  compact?: boolean;
  onClose?: () => void;
}) {
  const [timeframe, setTimeframe] = useState<BasketTimeframe>(defaultTimeframe);
  const [amount, setAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState<string>("1000");
  const [cursor, setCursor] = useState<number | null>(null);

  // Immediate 24h baseline from available basket assets
  const instant24h = useMemo(
    () => calculateBasket24hGrowth(basket, amount),
    [basket, amount],
  );

  const cachedPerf = useMemo(
    () => basketPerformanceClient.peek((basket as any).id, timeframe, amount),
    [basket, timeframe, amount],
  );

  const [performance, setPerformance] = useState<BasketPerformance>(cachedPerf ?? instant24h);
  const [loading, setLoading] = useState<boolean>(!cachedPerf && timeframe !== "24h");
  const [error, setError] = useState<string | null>(null);

  const gradientId = useId().replace(/:/g, "");

  useEffect(() => {
    const cached = basketPerformanceClient.peek((basket as any).id, timeframe, amount);
    if (cached) {
      setPerformance(cached);
      setLoading(false);
      setError(null);
      return;
    }

    if (timeframe === "24h") {
      setPerformance(calculateBasket24hGrowth(basket, amount));
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const data = await basketPerformanceClient.load(basket, timeframe, amount, controller.signal);
        if (active) {
          setPerformance(data);
          setLoading(false);
        }
      } catch (err: any) {
        if (active && err.name !== "AbortError") {
          // Graceful fallback to 24h calculation
          setPerformance(calculateBasket24hGrowth(basket, amount));
          setError("Historical closes are temporarily unavailable. Showing 24h performance.");
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [basket, timeframe, amount]);

  const changePct = performance.changePct;
  const isPositive = (changePct ?? 0) >= 0;
  const pnlUsd = performance.gainLossUsd;
  const endValue = performance.endValueUsd;

  const history = performance.history ?? [];
  const selectedIdx =
    cursor !== null && cursor >= 0 && cursor < history.length
      ? cursor
      : history.length - 1;
  const activePoint = history.length > 0 ? history[selectedIdx] : null;

  // Chart dimensions
  const width = compact ? 520 : 660;
  const height = compact ? 160 : 210;
  const pad = 12;

  const chartData = useMemo(() => {
    if (history.length < 2) return null;
    const values = history.map((h) => h.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const spread = maxVal - minVal || 1;

    const x = (i: number) => pad + (i / (history.length - 1)) * (width - pad * 2);
    const y = (v: number) => pad + ((maxVal - v) / spread) * (height - pad * 2);

    const linePoints = history
      .map((h, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(h.value).toFixed(1)}`)
      .join(" ");

    const areaPoints = `${linePoints} L${x(history.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;

    return { linePoints, areaPoints, x, y };
  }, [history, width, height]);

  const handleAmountSelect = (val: number) => {
    setAmount(val);
    setCustomAmount(String(val));
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setCustomAmount(valStr);
    const num = Number(valStr);
    if (Number.isFinite(num) && num > 0 && num <= 1_000_000) {
      setAmount(num);
    }
  };

  const activeTimeframeObj = TIMEFRAMES.find((t) => t.id === timeframe) ?? TIMEFRAMES[0];

  return (
    <div className={`basket-perf-panel panel ${compact ? "compact" : ""}`}>
      {/* Panel Header */}
      <div className="perf-header">
        <div className="perf-title-row">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="eyebrow" style={{ margin: 0 }}>
              Performance Engine
            </span>
            {performance.status === "partial" && (
              <span className="perf-status-badge partial" title="Some constituents lack price observations">
                Partial Data
              </span>
            )}
            {performance.status === "live" && (
              <span className="perf-status-badge live" title="All constituents priced & verified">
                Live Data
              </span>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close performance view"
              style={{ marginLeft: "auto" }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="perf-subhead">
          <h2>{basket.name}</h2>
          <span className="perf-ticker">{(basket as any).ticker || "BASKET"}</span>
        </div>
      </div>

      {/* Timeframe Selector Tabs */}
      <div className="perf-timeframe-toolbar">
        <div className="filter-tabs" role="group" aria-label="Select performance timeframe">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={timeframe === t.id ? "active" : ""}
              aria-pressed={timeframe === t.id}
              onClick={() => {
                setTimeframe(t.id);
                setCursor(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="perf-loading-indicator" role="status">
            <RefreshCw size={13} className="spin" />
            <span>Calculating…</span>
          </div>
        )}
      </div>

      {/* Hero Metric & P&L Card */}
      <div className="perf-hero-card">
        <div className="perf-hero-primary">
          <div className="perf-return-row">
            <span className={`perf-return-badge ${isPositive ? "up" : "down"}`}>
              {isPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              {changePct !== null ? `${isPositive ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
            </span>
            <span className="perf-period-label">{activeTimeframeObj.periodLabel}</span>
          </div>

          <div className="perf-pnl-summary">
            {pnlUsd !== null && endValue !== null ? (
              <p>
                <strong className={isPositive ? "up" : "down"}>
                  {pnlUsd >= 0 ? "+" : ""}${Math.abs(pnlUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>{" "}
                <span>
                  {pnlUsd >= 0 ? "Profit" : "Loss"} on {money(amount)}
                </span>{" "}
                <span className="perf-new-total">
                  (Est. Value: {money(endValue)})
                </span>
              </p>
            ) : (
              <p className="muted">Constituent pricing incomplete for P&amp;L projection.</p>
            )}
          </div>
        </div>

        {/* Investment Amount Controls */}
        <div className="perf-investment-controls">
          <span className="eyebrow" style={{ fontSize: 10 }}>
            Simulate Investment
          </span>
          <div className="perf-preset-buttons">
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                className={`btn-tag ${amount === amt ? "active" : ""}`}
                onClick={() => handleAmountSelect(amt)}
              >
                ${amt >= 1000 ? `${amt / 1000}k` : amt}
              </button>
            ))}
          </div>
          <div className="perf-amount-input-wrap">
            <DollarSign size={13} className="muted" />
            <input
              type="number"
              min="1"
              max="1000000"
              step="100"
              value={customAmount}
              onChange={handleCustomAmountChange}
              aria-label="Custom investment amount in USD"
            />
            <small>USD</small>
          </div>
        </div>
      </div>

      {/* Performance Chart */}
      <div className="perf-chart-container">
        {chartData && history.length >= 2 ? (
          <div
            className="perf-svg-wrapper"
            onMouseLeave={() => setCursor(null)}
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="perf-svg-chart"
              preserveAspectRatio="none"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relativeX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, (relativeX - pad) / (width - pad * 2)));
                const idx = Math.round(ratio * (history.length - 1));
                setCursor(idx);
              }}
            >
              <defs>
                <linearGradient id={`grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isPositive ? "rgba(16, 185, 129, 0.35)" : "rgba(244, 63, 94, 0.35)"}
                  />
                  <stop
                    offset="100%"
                    stopColor={isPositive ? "rgba(16, 185, 129, 0.0)" : "rgba(244, 63, 94, 0.0)"}
                  />
                </linearGradient>
              </defs>

              {/* Area fill */}
              <path d={chartData.areaPoints} fill={`url(#grad-${gradientId})`} />

              {/* Line stroke */}
              <path
                d={chartData.linePoints}
                fill="none"
                stroke={isPositive ? "#10b981" : "#f43f5e"}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Scrubber pointer */}
              {cursor !== null && activePoint && (
                <>
                  <line
                    x1={chartData.x(selectedIdx)}
                    y1={pad}
                    x2={chartData.x(selectedIdx)}
                    y2={height}
                    stroke="rgba(255, 255, 255, 0.35)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={chartData.x(selectedIdx)}
                    cy={chartData.y(activePoint.value)}
                    r={4}
                    fill={isPositive ? "#10b981" : "#f43f5e"}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                </>
              )}
            </svg>

            {/* Interactive chart scrubber read-out */}
            <div className="perf-chart-tooltip-bar">
              {activePoint ? (
                <>
                  <div className="perf-tooltip-left">
                    <Calendar size={12} className="muted" />
                    <span>{activePoint.date}</span>
                  </div>
                  <div className="perf-tooltip-right">
                    <span>Basket NAV: <strong>{activePoint.value.toFixed(2)}</strong></span>
                    <span className={activePoint.changePct >= 0 ? "up" : "down"}>
                      ({activePoint.changePct >= 0 ? "+" : ""}{activePoint.changePct.toFixed(2)}%)
                    </span>
                  </div>
                </>
              ) : (
                <span className="muted" style={{ fontSize: 11 }}>
                  Hover over the chart to inspect daily NAV and return.
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="perf-sparkline-fallback">
            <div className="perf-2point-bar">
              <div className="perf-point-node">
                <span className="node-label">Start</span>
                <strong>100.00</strong>
              </div>
              <div className="perf-track-line">
                <div
                  className="perf-track-progress"
                  style={{
                    width: `${Math.min(100, Math.max(10, 50 + (changePct ?? 0)))}%`,
                    background: isPositive ? "#10b981" : "#f43f5e",
                  }}
                />
              </div>
              <div className="perf-point-node text-right">
                <span className="node-label">Current</span>
                <strong>{changePct !== null ? (100 + changePct).toFixed(2) : "—"}</strong>
              </div>
            </div>
            <p className="caption muted" style={{ textAlign: "center", marginTop: 8 }}>
              Multi-day bars are being aggregated. Instant 24h weighted growth is active.
            </p>
          </div>
        )}
      </div>

      {/* Constituent Attribution & Contribution Table */}
      <div className="perf-attribution-section">
        <div className="flex-between" style={{ marginBottom: 10 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Constituent Attribution</h4>
          <span className="eyebrow" style={{ margin: 0 }}>
            {performance.constituents.length} Assets
          </span>
        </div>

        <div className="perf-table-wrapper">
          <table className="perf-attribution-table">
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col" className="num">Weight</th>
                <th scope="col" className="num">Price</th>
                <th scope="col" className="num">Return</th>
                <th scope="col" className="num">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {performance.constituents.map((c) => {
                const isGainer = performance.topGainer?.symbol === c.symbol;
                const isLoser = performance.topLoser?.symbol === c.symbol && performance.constituents.length > 1;
                const assetReturnPositive = (c.changePct ?? 0) >= 0;

                return (
                  <tr key={c.mint}>
                    <td>
                      <div className="perf-table-asset">
                        <AssetAvatar
                          asset={{
                            symbol: c.symbol,
                            logoUrl: null,
                            mint: c.mint,
                            underlyingSymbol: c.symbol,
                            issuer: "xstocks",
                          }}
                          small
                        />
                        <div className="perf-table-asset-info">
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <strong>{c.symbol}</strong>
                            {isGainer && (
                              <span className="perf-driver-pill top" title="Top return driver for this basket">
                                <Award size={10} /> Top
                              </span>
                            )}
                            {isLoser && (
                              <span className="perf-driver-pill drag" title="Largest drag on this basket">
                                Drag
                              </span>
                            )}
                          </div>
                          <small className="muted">{c.name}</small>
                        </div>
                      </div>
                    </td>

                    <td className="num">
                      <span className="perf-weight-pill">
                        {c.weightPct.toFixed(1)}%
                      </span>
                    </td>

                    <td className="num">
                      {c.currentPriceUsd !== null ? money(c.currentPriceUsd) : "—"}
                    </td>

                    <td className="num">
                      {c.changePct !== null ? (
                        <span className={assetReturnPositive ? "up" : "down"}>
                          {assetReturnPositive ? "+" : ""}
                          {c.changePct.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    <td className="num">
                      {c.contributionPct !== null ? (
                        <strong className={c.contributionPct >= 0 ? "up" : "down"}>
                          {c.contributionPct >= 0 ? "+" : ""}
                          {c.contributionPct.toFixed(2)}%
                        </strong>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warnings & Notes */}
      {error && (
        <div className="notice warning" style={{ marginTop: 12 }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Data Source & Oracle Footnote */}
      <div className="perf-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={14} className="up" />
          <span>
            Verified by <strong>Pyth Network Oracles</strong> &amp; daily market closes.
          </span>
        </div>
        <span className="muted">
          Weighted Largest-Remainder allocation · Non-custodial direct delivery.
        </span>
      </div>
    </div>
  );
}
