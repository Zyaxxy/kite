import { toTokenAmount } from "../trading";

export const ROUTE_ACCOUNT_TIERS = [32, 40, 48] as const;
export type RouteHealthStatus =
  | "routable"
  | "no-route"
  | "liquidity"
  | "capacity"
  | "unknown"
  | "unavailable";
export interface BasketRouteHealthRequest {
  basketId?: string;
  allocations?: Array<{ mint: string; weightBps: number }>;
  inputMint: string;
  amount: string;
  slippageBps: number;
}
export interface RouteObservation {
  status: RouteHealthStatus;
  checkedAt: number;
  expiresAt: number;
  detail: string;
  maxAccounts: number | null;
  /** Exact raw input used for the advisory probe, never an executable quote. */
  probeAmount: string;
  /** Three successful observations at least five minutes apart within 24 hours. */
  consistent: boolean;
}
export interface BasketRouteHealth {
  network: "mainnet-beta";
  inputMint: string;
  inputSymbol: string;
  inputDecimals: number;
  amount: string;
  slippageBps: number;
  advisory: true;
  legs: Array<
    RouteObservation & {
      mint: string;
      symbol: string;
      allocatedAmount: string;
      liquidityUsd: number | null;
    }
  >;
}
export interface BasketRouteCoverage {
  basketId: string;
  funding: Array<{
    inputMint: string;
    symbol: string;
    routable: number;
    total: number;
    checkedAt: number | null;
    stale: boolean;
    consistent: boolean;
  }>;
  featured: boolean;
}

/** Finite probe bands prevent arbitrary amounts from creating unbounded cache keys. */
export function routeProbeAmount(raw: bigint, decimals: number): string {
  if (raw <= 0n) throw new Error("A positive route amount is required.");
  const bands =
    decimals === 9
      ? [
          "0.001",
          "0.005",
          "0.01",
          "0.025",
          "0.05",
          "0.1",
          "0.25",
          "0.5",
          "1",
          "5",
          "10",
          "50",
          "100",
          "1000",
        ]
      : [
          "1",
          "5",
          "10",
          "25",
          "50",
          "100",
          "250",
          "500",
          "1000",
          "5000",
          "10000",
          "100000",
        ];
  const result = bands
    .map((amount) => BigInt(toTokenAmount(amount, decimals)))
    .find((amount) => amount >= raw);
  if (!result)
    throw new Error(
      "This amount exceeds advisory route-check bands. Use the exact purchase review.",
    );
  return result.toString();
}

/** Only definitive provider codes establish a failure category. */
export function classifyJupiterRouteError(
  httpStatus: number,
  value: unknown,
): RouteHealthStatus {
  if (httpStatus !== 400 && httpStatus !== 422) return "unknown";
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const code = data.errorCode ?? data.error;
  if (
    [
      "NO_ROUTES_FOUND",
      "COULD_NOT_FIND_ANY_ROUTE",
      "No routes found",
      "Could not find any route",
    ].includes(String(code))
  )
    return "no-route";
  if (
    [
      "ROUTE_PLAN_DOES_NOT_CONSUME_ALL_THE_AMOUNT",
      "SLIPPAGE_TOLERANCE_EXCEEDED",
      "SlippageToleranceExceeded",
    ].includes(String(code))
  )
    return "liquidity";
  if (code === "MAX_ACCOUNT_GREATER_THAN_MAX") return "capacity";
  if (code === "TOKEN_NOT_TRADABLE") return "unavailable";
  return "unknown";
}

export const ROUTE_HEALTH_LABELS: Record<RouteHealthStatus, string> = {
  routable: "Route found",
  "no-route": "No route at probe amount",
  liquidity: "Cannot fill amount / slippage",
  capacity: "Route account limit",
  unknown: "Route availability unknown",
  unavailable: "Asset unavailable",
};

/** Actionable copy for definitive routing failures; unknown never means illiquid. */
export function describeRouteFailure(
  status: RouteHealthStatus,
  funding: string,
  stocks: string,
): string {
  const alternatives = ["USDC", "USDT", "SOL"]
    .filter((symbol) => symbol !== funding)
    .join(" or ");
  const changeToken = `Try paying with ${alternatives}; availability will be checked again.`;
  switch (status) {
    case "no-route":
      return `No Jupiter route from ${funding} to ${stocks} at this amount. ${changeToken} You can also change the amount or wait and retry. No assets will be skipped.`;
    case "liquidity":
      return `${stocks} cannot fill the requested amount within your selected slippage from ${funding}. Try a smaller amount or another funding token, or wait for liquidity to improve. Slippage will not be increased automatically.`;
    case "capacity":
      return `The route for ${stocks} exceeds route account limits. ${changeToken} Custom baskets can also replace this stock. Transaction safety limits will not be relaxed.`;
    case "unavailable":
      return `${stocks} is not currently tradable through Jupiter. Retry later, choose another basket, or replace this stock in a custom basket. Changing the funding token may not resolve this.`;
    default:
      return `Route availability for ${stocks} is temporarily unknown. Wait and retry the check, or use exact purchase review to check again. This does not establish insufficient liquidity.`;
  }
}

export function routeHealthGuidance(
  value: BasketRouteHealth | null,
  now = Date.now(),
): string | null {
  if (!value) return null;
  const stale = value.legs.some((leg) => leg.expiresAt <= now);
  if (stale)
    return "Route checks are stale. Exact purchase review will check current availability again.";
  const problems = value.legs.filter((leg) => leg.status !== "routable");
  if (!problems.length) return null;
  const definite = problems.filter((leg) => leg.status !== "unknown");
  if (!definite.length)
    return describeRouteFailure(
      "unknown",
      value.inputSymbol,
      problems.map((leg) => leg.symbol).join(", "),
    );
  // Mixed failures must retain their individual meanings instead of labelling every stock illiquid.
  const statuses = [...new Set(definite.map((leg) => leg.status))];
  return statuses
    .map((status) => {
      const stocks = definite
        .filter((leg) => leg.status === status)
        .map((leg) => leg.symbol)
        .join(", ");
      return `Cached amount-band check: ${describeRouteFailure(status, value.inputSymbol, stocks)}`;
    })
    .join(" ");
}
