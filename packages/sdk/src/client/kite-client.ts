import type {
  BasketOrder,
  BasketOrderRequest,
  WalletTransactionOrder,
  RecurringPayment,
  RecurringPaymentRequest,
} from "../basket/mainnet";
import type { MarketSnapshot } from "../markets";
import {
  assertRecurringInvestmentSchedule,
  deriveRecurringPermissionWindow,
  type RecurringInvestmentConfig,
  type RecurringInvestmentPlan,
  type RecurringInvestmentReceipt,
  type CreateInvestmentPlanRequest,
  type InvestmentPlanReview,
} from "../recurring-investing";
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
  supportedTransactionVersions?: number[];
  inputMint: string;
  outputMint: string;
  amount: string;
  taker: string;
}
export interface ExecuteTradeRequest {
  investmentSetup?: RecurringInvestmentPlan;
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
    value.transactionVersion !== 1 ||
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
  async requestBasketOrder(
    input: BasketOrderRequest,
    signal?: AbortSignal,
  ): Promise<BasketOrder> {
    const { data } = await this.request("/api/buy-basket", {
      body: input,
      signal,
    });
    return verified<BasketOrder>(
      data,
      (v) =>
        validWalletOrder(v, input.taker) &&
        v.basketId === input.basketId &&
        v.inputMint === input.inputMint &&
        Number.isInteger(v.inputDecimals) &&
        v.inAmount === toTokenAmount(input.amount, v.inputDecimals as number) &&
        v.slippageBps === input.slippageBps &&
        validBasketOutputs(v.outputs, v.inAmount as string),
    );
  }
  async getRecurringPayments(
    wallet: string,
    signal?: AbortSignal,
  ): Promise<RecurringPayment[]> {
    const { data } = await this.request(
      `/api/recurring?wallet=${encodeURIComponent(wallet)}`,
      { signal },
    );
    return verified<{ payments: RecurringPayment[] }>(
      data,
      (v) =>
        Array.isArray(v.payments) &&
        v.payments.every((p) => record(p) && p.owner === wallet),
    ).payments;
  }
  async requestRecurringPayment(
    input: RecurringPaymentRequest,
  ): Promise<
    WalletTransactionOrder & { payment: RecurringPayment; decimals: number }
  > {
    const { data } = await this.request("/api/recurring", { body: input });
    return verified(
      data,
      (v) =>
        validWalletOrder(v, input.taker) &&
        record(v.payment) &&
        v.payment.owner === input.taker &&
        v.payment.buyer === input.buyer &&
        v.payment.mint === input.mint &&
        v.payment.periodSeconds === input.periodSeconds &&
        Number.isInteger(v.decimals) &&
        v.payment.amountPerPeriod ===
          toTokenAmount(input.amount, v.decimals as number),
    );
  }
  async revokeRecurringPayment(
    taker: string,
    delegation: string,
    supportedTransactionVersions?: number[],
  ): Promise<WalletTransactionOrder> {
    const { data } = await this.request("/api/recurring/revoke", {
      body: { taker, delegation, supportedTransactionVersions },
    });
    return verified(data, (v) => validWalletOrder(v, taker));
  }
  async collectRecurringPayment(
    taker: string,
    delegation: string,
    supportedTransactionVersions?: number[],
  ): Promise<
    WalletTransactionOrder & {
      amount: string;
      periodStartedAt: number;
      mint: string;
    }
  > {
    const { data } = await this.request("/api/recurring/collect", {
      body: { taker, delegation, supportedTransactionVersions },
    });
    return verified(
      data,
      (v) =>
        validWalletOrder(v, taker) &&
        typeof v.amount === "string" &&
        typeof v.periodStartedAt === "number",
    );
  }
  async getInvestmentConfig(
    signal?: AbortSignal,
  ): Promise<RecurringInvestmentConfig> {
    const { data } = await this.request("/api/investing/config", { signal });
    return verified(
      data,
      (v) =>
        typeof v.configured === "boolean" &&
        typeof v.available === "boolean" &&
        v.transactionVersion === 1 &&
        (v.executor === null || typeof v.executor === "string") &&
        (v.reason === null || typeof v.reason === "string"),
    );
  }
  async getInvestmentPlans(
    wallet: string,
    signal?: AbortSignal,
  ): Promise<{
    plans: RecurringInvestmentPlan[];
    receipts: RecurringInvestmentReceipt[];
  }> {
    const { data } = await this.request(
      `/api/investing/plans?wallet=${encodeURIComponent(wallet)}`,
      { signal },
    );
    return verified(
      data,
      (v) =>
        Array.isArray(v.plans) &&
        v.plans.every(
          (p) => record(p) && p.owner === wallet && validInvestmentPlan(p),
        ) &&
        Array.isArray(v.receipts) &&
        v.receipts.every((r) => validInvestmentReceipt(r)),
    );
  }
  async requestInvestmentPlan(
    input: CreateInvestmentPlanRequest,
  ): Promise<InvestmentPlanReview> {
    const { data } = await this.request("/api/investing/plans", {
      body: input,
    });
    return verified(data, (v) => {
      if (
        !record(v.order) ||
        !validWalletOrder(v.order, input.taker) ||
        v.order.transactionVersion !== 1 ||
        !record(v.plan) ||
        !validInvestmentPlan(v.plan)
      )
        return false;
      const p = v.plan as unknown as RecurringInvestmentPlan;
      return (
        JSON.stringify(v.order.investmentSetup) === JSON.stringify(p) &&
        p.owner === input.taker &&
        p.fundingMint === input.fundingMint &&
        p.amountUnits === toTokenAmount(input.amount, p.fundingDecimals) &&
        p.target.type === input.target.type &&
        p.target.id === input.target.id &&
        p.slippageBps === input.slippageBps &&
        p.schedule.startsAt === input.schedule.startsAt &&
        p.schedule.unit === input.schedule.unit &&
        p.schedule.interval === input.schedule.interval &&
        p.schedule.occurrences === input.schedule.occurrences
      );
    });
  }
  async executeTransaction(
    input: ExecuteTradeRequest,
  ): Promise<MainnetTradeResult> {
    try {
      const { data } = await this.request("/api/transaction/execute", {
        body: input,
        acceptExecutionResult: true,
      });
      return classifyTradeExecution(data);
    } catch {
      return classifyTradeExecution(null);
    }
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

function validWalletOrder(v: Record<string, unknown>, taker: string) {
  return (
    v.taker === taker &&
    typeof v.requestId === "string" &&
    typeof v.transaction === "string" &&
    v.transaction.length <= 8000 &&
    typeof v.authorization === "string" &&
    v.authorization.length <= 4000 &&
    typeof v.expiresAt === "number" &&
    Number.isFinite(v.expiresAt) &&
    (v.transactionVersion === 0 || v.transactionVersion === 1)
  );
}

function validInvestmentPlan(p: Record<string, unknown>): boolean {
  try {
    if (
      typeof p.id !== "string" ||
      !/^[a-f0-9]{32}$/.test(p.id) ||
      typeof p.owner !== "string" ||
      typeof p.buyer !== "string" ||
      typeof p.delegation !== "string" ||
      typeof p.fundingMint !== "string" ||
      typeof p.amountUnits !== "string" ||
      !/^\d{1,20}$/.test(p.amountUnits) ||
      !Number.isInteger(p.fundingDecimals) ||
      Number(p.fundingDecimals) < 0 ||
      Number(p.fundingDecimals) > 18 ||
      !record(p.target) ||
      !["stock", "basket"].includes(String(p.target.type)) ||
      typeof p.target.id !== "string" ||
      !record(p.schedule) ||
      !record(p.permission) ||
      !Array.isArray(p.allocations) ||
      !p.allocations.length ||
      p.allocations.length > 12 ||
      !["draft", "active", "paused", "revoked", "completed"].includes(
        String(p.status),
      )
    )
      return false;
    const plan = p as unknown as RecurringInvestmentPlan;
    assertRecurringInvestmentSchedule(plan.schedule);
    const terms = deriveRecurringPermissionWindow(plan.schedule);
    if (
      Object.entries(terms).some(
        ([k, v]) =>
          p.permission && (p.permission as Record<string, unknown>)[k] !== v,
      )
    )
      return false;
    return (
      plan.allocations.every(
        (a) =>
          typeof a.mint === "string" &&
          typeof a.symbol === "string" &&
          Number.isInteger(a.weightBps) &&
          a.weightBps > 0,
      ) &&
      plan.allocations.reduce((s, a) => s + a.weightBps, 0) === 10000 &&
      new Set(plan.allocations.map((a) => a.mint)).size ===
        plan.allocations.length
    );
  } catch {
    return false;
  }
}
function validInvestmentReceipt(value: unknown): boolean {
  const raw = (v: unknown) => typeof v === "string" && /^\d{1,20}$/.test(v);
  if (
    !record(value) ||
    typeof value.planId !== "string" ||
    typeof value.runId !== "string" ||
    !["prepared", "pending", "success", "failed", "skipped"].includes(
      String(value.status),
    ) ||
    !Number.isSafeInteger(value.scheduledAt) ||
    Number(value.scheduledAt) < 0 ||
    !Number.isSafeInteger(value.updatedAt) ||
    !raw(value.amountUnits)
  )
    return false;
  if (
    value.signature !== undefined &&
    (typeof value.signature !== "string" ||
      !/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(value.signature))
  )
    return false;
  return (
    value.outputs === undefined ||
    (Array.isArray(value.outputs) &&
      value.outputs.every(
        (o) =>
          record(o) &&
          typeof o.mint === "string" &&
          typeof o.symbol === "string" &&
          raw(o.amountUnits) &&
          Number.isInteger(o.decimals) &&
          Number(o.decimals) >= 0 &&
          Number(o.decimals) <= 18,
      ))
  );
}

function validBasketOutputs(outputs: unknown, input: string): boolean {
  const raw = (v: unknown): v is string =>
    typeof v === "string" &&
    /^\d{1,20}$/.test(v) &&
    BigInt(v) > BigInt(0) &&
    BigInt(v) < BigInt(2) ** BigInt(64);
  if (
    !Array.isArray(outputs) ||
    !outputs.length ||
    outputs.length > 12 ||
    !outputs.every(
      (o) =>
        record(o) &&
        typeof o.mint === "string" &&
        typeof o.symbol === "string" &&
        typeof o.decimals === "number" &&
        Number.isInteger(o.decimals) &&
        o.decimals >= 0 &&
        o.decimals <= 18 &&
        raw(o.inputAmount) &&
        raw(o.outAmount) &&
        raw(o.minimumAmount) &&
        BigInt(o.minimumAmount) <= BigInt(o.outAmount) &&
        Number.isSafeInteger(o.weightBps) &&
        Number(o.weightBps) > 0,
    )
  )
    return false;
  return (
    new Set(outputs.map((o) => o.mint)).size === outputs.length &&
    outputs.reduce((s, o) => s + o.weightBps, 0) === 10000 &&
    outputs.reduce((s, o) => s + BigInt(o.inputAmount), BigInt(0)) ===
      BigInt(input)
  );
}
