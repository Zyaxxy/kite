"use client";
import {
  fromTokenAmount,
  ROUTE_HEALTH_LABELS,
  routeHealthGuidance,
  type BasketRouteHealthRequest,
  type BasketRouteHealth,
} from "@kite/sdk";
import { useRouteHealth } from "./useRouteHealth";
import styles from "./RouteHealth.module.css";

export function RouteHealth({
  input,
}: {
  input: BasketRouteHealthRequest | null;
}) {
  const state = useRouteHealth(input);
  return <RouteHealthReport input={input} {...state} />;
}
export function RouteHealthReport({
  input,
  value,
  loading,
  error,
}: {
  input: BasketRouteHealthRequest | null;
  value: BasketRouteHealth | null;
  loading: boolean;
  error: string;
}) {
  if (!input)
    return (
      <p className="fineprint">
        Choose USDC, USDT or SOL and an amount to check stock routes.
      </p>
    );
  const count =
    value?.legs.filter((leg) => leg.status === "routable").length ?? 0;
  const stale = value?.legs.some((leg) => leg.expiresAt <= Date.now());
  const unknown =
    value?.legs.filter((leg) => leg.status === "unknown").length ?? 0;
  const guidance = routeHealthGuidance(value);
  return (
    <div className={styles.health} aria-live="polite" aria-busy={loading}>
      <div className={styles.heading}>
        <span>Route availability</span>
        <span>Mainnet</span>
      </div>
      {loading ? (
        <p>
          Checking stock routes… Wait for this check before purchase review.
        </p>
      ) : error ? (
        <p>{error}</p>
      ) : value ? (
        <>
          <details>
            <summary>
              {count}/{value.legs.length} stocks with observed routes from{" "}
              {value.inputSymbol}
              {unknown > 0 ? ` · ${unknown} unknown` : ""}
              {stale ? " · stale" : ""}
            </summary>
            <div className={styles.rows}>
              {value.legs.map((leg) => (
                <div key={leg.mint} className={styles.row}>
                  <div className={styles.label}>
                    <strong>{leg.symbol}</strong>
                    <span data-ready={leg.status === "routable"}>
                      {ROUTE_HEALTH_LABELS[leg.status]}
                    </span>
                  </div>
                  <p>{leg.detail}</p>
                  <p>
                    Checked at{" "}
                    {fromTokenAmount(leg.probeAmount, value.inputDecimals)}{" "}
                    {value.inputSymbol} ·{" "}
                    {new Date(leg.checkedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {leg.expiresAt <= Date.now() ? " · stale" : ""}
                  </p>
                  <p>
                    {leg.liquidityUsd === null
                      ? "Pool liquidity data unavailable"
                      : `Reported pool liquidity: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(leg.liquidityUsd)}. This does not establish a fill.`}
                  </p>
                </div>
              ))}
            </div>
          </details>
          {guidance && <p className={styles.note}>{guidance}</p>}
          <p className={styles.note}>
            Cached amount-band checks. Your exact amount, wallet, transaction
            format and complete basket are checked again at review.
          </p>
        </>
      ) : null}
    </div>
  );
}
