import type { MarketSnapshot } from "../markets";
import type { StockResearch } from "../research";
import {
  classifyTradeExecution,
  MAX_SWAP_SLIPPAGE_BPS,
  toTokenAmount,
  type MainnetPortfolio,
  type MainnetTradeOrder,
  type MainnetTradeResult,
  type SwapToken,
} from "../trading";

export interface TradeOrderRequest {
  inputMint: string;
  outputMint: string;
  amount: string;
  taker: string;
}
export interface ExecuteTradeRequest {
  signedTransaction: string;
  authorization: string;
}
export type ConditionalResult<T> =
  | { notModified: true; etag: string | null }
  | { notModified: false; etag: string | null; data: T };
export class KiteApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "KiteApiError";
  }
}
export interface KiteClientConfig {
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  /** Explicit opt-in for a local development server. Never use in release builds. */
  allowInsecureHttp?: boolean;
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function verified<T>(
  value: unknown,
  check: (value: Record<string, unknown>) => boolean,
): T {
  if (!record(value) || !check(value))
    throw new KiteApiError(
      "The service returned an invalid response. Please retry.",
    );
  return value as T;
}
function matchesOrder(
  value: Record<string, unknown>,
  input: TradeOrderRequest,
): boolean {
  const precision = (n: unknown): n is number =>
    typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 18;
  const raw = (n: unknown): n is string =>
    typeof n === "string" &&
    /^\d{1,20}$/.test(n) &&
    BigInt(n) > BigInt(0) &&
    BigInt(n) <= BigInt("18446744073709551615");
  const text = (n: unknown, max: number): n is string =>
    typeof n === "string" && n.length > 0 && n.length <= max;
  if (
    value.taker !== input.taker ||
    value.inputMint !== input.inputMint ||
    value.outputMint !== input.outputMint ||
    !precision(value.inputDecimals) ||
    !precision(value.outputDecimals) ||
    !raw(value.inAmount) ||
    !raw(value.outAmount) ||
    !text(value.transaction, 8_000) ||
    !text(value.authorization, 4_000) ||
    !text(value.requestId, 256) ||
    !text(value.inputSymbol, 40) ||
    !text(value.outputSymbol, 40) ||
    !text(value.router, 160) ||
    typeof value.expiresAt !== "number" ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt <= 0 ||
    typeof value.slippageBps !== "number" ||
    !Number.isInteger(value.slippageBps) ||
    value.slippageBps < 0 ||
    value.slippageBps > MAX_SWAP_SLIPPAGE_BPS ||
    typeof value.feeBps !== "number" ||
    !Number.isFinite(value.feeBps) ||
    value.feeBps < 0 ||
    value.feeBps > 10_000 ||
    (value.otherAmountThreshold !== undefined &&
      (!raw(value.otherAmountThreshold) ||
        BigInt(value.otherAmountThreshold) > BigInt(value.outAmount)))
  )
    return false;
  try {
    return value.inAmount === toTokenAmount(input.amount, value.inputDecimals);
  } catch {
    return false;
  }
}

/** One transport for browser, native and workers. Writes are never automatically retried. */
export class KiteClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  constructor(config: KiteClientConfig = {}) {
    const base = (config.baseUrl ?? "").replace(/\/+$/, "");
    if (base) {
      const url = new URL(base);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== "https:" &&
          !(config.allowInsecureHttp && url.protocol === "http:"))
      )
        throw new KiteApiError(
          "Use an HTTPS Kite API URL without credentials, query parameters or fragments.",
        );
    }
    this.baseUrl = base;
    this.fetcher = config.fetcher ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = config.timeoutMs ?? 60_000;
    if (
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs <= 0 ||
      this.timeoutMs > 120_000
    )
      throw new KiteApiError(
        "Request timeout must be between 1 and 120000 milliseconds.",
      );
  }
  private async request(
    path: string,
    options: {
      signal?: AbortSignal;
      etag?: string | null;
      body?: unknown;
      acceptExecutionResult?: boolean;
    } = {},
  ): Promise<{ response: Response; data: unknown }> {
    if (options.signal?.aborted) throw new KiteApiError("Request cancelled.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: options.body === undefined ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          ...(options.etag ? { "If-None-Match": options.etag } : {}),
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
      });
      if (controller.signal.aborted) throw new Error("Request cancelled");
      if (response.status === 304 && options.etag)
        return { response, data: null };
      if (
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("application/json")
      )
        throw new KiteApiError(
          "The API returned a web page instead of data. Check the API URL, tunnel and deployment access settings.",
          response.status,
        );
      const data: unknown = await response.json();
      if (controller.signal.aborted) throw new Error("Request cancelled");
      if (
        !response.ok &&
        !(
          options.acceptExecutionResult &&
          record(data) &&
          ["Success", "Failed", "Unknown"].includes(String(data.status))
        )
      )
        throw new KiteApiError(
          record(data) && typeof data.error === "string"
            ? data.error.slice(0, 500)
            : `The service returned ${response.status}. Please retry.`,
          response.status,
        );
      return { response, data };
    } catch (error) {
      if (error instanceof KiteApiError) throw error;
      throw new KiteApiError(
        options.signal?.aborted
          ? "Request cancelled."
          : controller.signal.aborted
            ? "The connection timed out. Please retry."
            : "Unable to reach the Kite API. Check your connection and server URL.",
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  async getMarkets(
    options: { etag?: string | null; signal?: AbortSignal } = {},
  ): Promise<ConditionalResult<MarketSnapshot>> {
    const { response, data } = await this.request("/api/markets", options);
    const etag = response.headers.get("etag") ?? options.etag ?? null;
    if (response.status === 304) return { notModified: true, etag };
    return {
      notModified: false,
      etag,
      data: verified<MarketSnapshot>(
        data,
        (v) =>
          v.network === "mainnet-beta" &&
          Array.isArray(v.assets) &&
          Array.isArray(v.baskets) &&
          typeof v.asOf === "string" &&
          Number.isFinite(Date.parse(v.asOf)),
      ),
    };
  }
  async getResearch(
    mint: string,
    signal?: AbortSignal,
  ): Promise<StockResearch> {
    const { data } = await this.request(
      `/api/research?mint=${encodeURIComponent(mint)}`,
      { signal },
    );
    return verified<StockResearch>(
      data,
      (v) =>
        v.mint === mint &&
        Array.isArray(v.news) &&
        Array.isArray(v.events) &&
        typeof v.asOf === "string",
    );
  }
  async getPortfolio(
    wallet: string,
    signal?: AbortSignal,
  ): Promise<MainnetPortfolio> {
    const { data } = await this.request(
      `/api/portfolio?wallet=${encodeURIComponent(wallet)}`,
      { signal },
    );
    return verified<MainnetPortfolio>(
      data,
      (v) =>
        v.walletAddress === wallet &&
        v.network === "mainnet-beta" &&
        Array.isArray(v.holdings),
    );
  }
  async searchTokens(
    query: string,
    signal?: AbortSignal,
  ): Promise<SwapToken[]> {
    const { data } = await this.request(
      `/api/tokens?query=${encodeURIComponent(query)}`,
      { signal },
    );
    return verified<{ tokens: SwapToken[] }>(data, (v) =>
      Array.isArray(v.tokens),
    ).tokens;
  }
  async requestTradeOrder(
    input: TradeOrderRequest,
    signal?: AbortSignal,
  ): Promise<MainnetTradeOrder> {
    const request = { ...input };
    const { data } = await this.request("/api/trade/order", {
      signal,
      body: request,
    });
    return verified<MainnetTradeOrder>(data, (value) =>
      matchesOrder(value, request),
    );
  }
  async executeTrade(
    input: ExecuteTradeRequest,
    signal?: AbortSignal,
  ): Promise<MainnetTradeResult> {
    try {
      const { data } = await this.request("/api/trade/execute", {
        signal,
        body: input,
        acceptExecutionResult: true,
      });
      return classifyTradeExecution(data);
    } catch {
      // A dropped response can occur after broadcast. Never invite an automatic second trade.
      return classifyTradeExecution(null);
    }
  }
}
