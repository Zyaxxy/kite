import type {
  DevnetRecurringPlanRequest,
  DevnetRecurringCloseRequest,
  DevnetRecurringPreparedTransaction,
} from "../recurring-investing";

export interface DevnetRecurringReview extends DevnetRecurringPreparedTransaction {
  terms?: {
    amount: string;
    fundingSymbol: string;
    periodSeconds: number;
    periods: number;
    startsAt: number;
    expiresAt: number;
    minimumPolicy: string;
    outputs: {
      mint: string;
      symbol: string;
      decimals: number;
      weightBps: number;
      minimumAmountOut: string;
    }[];
  };
}
export interface DevnetRecurringPublicPlan {
  address: string;
  owner: string;
  fundingAmount: string;
  periodSeconds: number;
  startsAt: number;
  expiresAt: number;
  periods: number;
  executedPeriods: number;
  duePeriodIndex: number | null;
  outputs: { mint: string; weightBps: number }[];
}
export interface DevnetRecurringConfig {
  schemaVersion: 1;
  protocolVersion: 2;
  network: "devnet";
  testTokensOnly: true;
  readyToPrepare: boolean;
  reasons: string[];
  fundingSymbol: string;
  stocks: { id: string; name: string; symbol: string; available: boolean }[];
  baskets: { id: string; name: string; ticker: string; available: boolean }[];
}
export interface DevnetRecurringExecution {
  status: "failed" | "confirmed" | "submitted" | "unknown" | "expired";
  signature: string;
  explorerUrl: string;
}

export function assertDevnetRecurringReview(
  value: unknown,
  owner: string,
): asserts value is DevnetRecurringReview {
  const v = value as Partial<DevnetRecurringReview> | null;
  if (
    !v ||
    v.schemaVersion !== 1 ||
    v.protocolVersion !== 2 ||
    v.network !== "devnet" ||
    v.signer !== owner ||
    ![0, 1].includes(v.transactionVersion!) ||
    !["create", "close"].includes(v.operation!) ||
    typeof v.plan !== "string" ||
    typeof v.transaction !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(v.transaction) ||
    v.transaction.length > 8192 ||
    typeof v.authorization !== "string" ||
    !v.authorization ||
    v.authorization.length > 4096 ||
    !Number.isSafeInteger(v.expiresAt)
  )
    throw new Error(
      "The service did not return a valid devnet review for this wallet.",
    );
  if (v.operation === "create") {
    const t = v.terms;
    if (
      !t ||
      typeof t.amount !== "string" ||
      typeof t.fundingSymbol !== "string" ||
      typeof t.minimumPolicy !== "string" ||
      !Number.isSafeInteger(t.periodSeconds) ||
      t.periodSeconds < 60 ||
      !Number.isSafeInteger(t.periods) ||
      t.periods < 1 ||
      !Number.isSafeInteger(t.startsAt) ||
      !Number.isSafeInteger(t.expiresAt) ||
      !Array.isArray(t.outputs) ||
      !t.outputs.length ||
      t.outputs.length > 20 ||
      t.outputs.some(
        (o) =>
          !o ||
          typeof o.mint !== "string" ||
          typeof o.symbol !== "string" ||
          !Number.isInteger(o.decimals) ||
          o.decimals < 0 ||
          o.decimals > 9 ||
          !Number.isInteger(o.weightBps) ||
          o.weightBps <= 0 ||
          typeof o.minimumAmountOut !== "string" ||
          !/^\d{1,20}$/.test(o.minimumAmountOut),
      )
    )
      throw new Error(
        "The recurring plan is missing its reviewed amount, schedule, or outputs.",
      );
  }
}

/** Shared transport for native and web. Cluster selection stays on the server; every response is devnet-scoped. */
export class DevnetRecurringClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  constructor(
    config: {
      baseUrl?: string;
      allowInsecureHttp?: boolean;
      fetcher?: typeof fetch;
    } = {},
  ) {
    const base = config.baseUrl ?? "";
    if (base) {
      const url = new URL(base);
      if (
        (url.protocol !== "https:" &&
          !(config.allowInsecureHttp && url.protocol === "http:")) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
      )
        throw new Error(
          "Configure a public HTTPS API origin for recurring plans.",
        );
      this.baseUrl = url.origin;
    } else this.baseUrl = "";
    this.fetcher = config.fetcher ?? fetch;
  }
  private async request(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 60_000);
    try {
      const response = await this.fetcher(
        `${this.baseUrl}/api/recurring${path}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers:
            body === undefined
              ? { Accept: "application/json" }
              : {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
        },
      );
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "The recurring API returned a non-JSON response. Check the API origin or tunnel.",
        );
      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "The devnet request failed.";
        throw new Error(message);
      }
      return data;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  async config(signal?: AbortSignal): Promise<DevnetRecurringConfig> {
    const v = (await this.request(
      "/config",
      undefined,
      signal,
    )) as Partial<DevnetRecurringConfig> | null;
    if (
      !v ||
      v.schemaVersion !== 1 ||
      v.protocolVersion !== 2 ||
      v.network !== "devnet" ||
      v.testTokensOnly !== true ||
      typeof v.readyToPrepare !== "boolean" ||
      !Array.isArray(v.reasons) ||
      v.reasons.some((r) => typeof r !== "string") ||
      typeof v.fundingSymbol !== "string" ||
      !Array.isArray(v.stocks) ||
      !Array.isArray(v.baskets) ||
      [...v.stocks, ...v.baskets].some(
        (t) =>
          !t ||
          typeof t.id !== "string" ||
          typeof t.name !== "string" ||
          typeof t.available !== "boolean",
      )
    )
      throw new Error(
        "The recurring service did not return a valid devnet configuration.",
      );
    return v as DevnetRecurringConfig;
  }
  async plans(
    owner: string,
    signal?: AbortSignal,
  ): Promise<DevnetRecurringPublicPlan[]> {
    const v = (await this.request(
      `?wallet=${encodeURIComponent(owner)}`,
      undefined,
      signal,
    )) as { network?: unknown; plans?: unknown } | null;
    if (
      !v ||
      v.network !== "devnet" ||
      !Array.isArray(v.plans) ||
      v.plans.some(
        (p: Partial<DevnetRecurringPublicPlan> | null) =>
          !p ||
          p.owner !== owner ||
          typeof p.address !== "string" ||
          typeof p.fundingAmount !== "string" ||
          !/^\d{1,20}$/.test(p.fundingAmount) ||
          !Number.isSafeInteger(p.periods) ||
          !Number.isSafeInteger(p.executedPeriods) ||
          !Number.isSafeInteger(p.periodSeconds) ||
          !Number.isSafeInteger(p.expiresAt) ||
          !Number.isSafeInteger(p.startsAt) ||
          !Array.isArray(p.outputs),
      )
    )
      throw new Error(
        "The recurring service returned plans for an invalid network or wallet.",
      );
    return v.plans as DevnetRecurringPublicPlan[];
  }
  async prepare(
    input: DevnetRecurringPlanRequest,
  ): Promise<DevnetRecurringReview> {
    const v = await this.request("", input);
    assertDevnetRecurringReview(v, input.owner);
    if (v.operation !== "create")
      throw new Error("Expected a plan creation review.");
    if (
      v.terms?.amount !== input.amount ||
      v.terms.periods !== input.periods ||
      v.terms.periodSeconds !== input.periodSeconds
    )
      throw new Error(
        "The recurring review does not match your amount or schedule.",
      );
    return v;
  }
  async revoke(
    input: DevnetRecurringCloseRequest,
  ): Promise<DevnetRecurringReview> {
    const v = await this.request("/revoke", input);
    assertDevnetRecurringReview(v, input.owner);
    if (v.operation !== "close" || v.plan !== input.plan)
      throw new Error("The cancellation review does not match this plan.");
    return v;
  }
  async execute(input: {
    authorization: string;
    signedTransaction: string;
  }): Promise<DevnetRecurringExecution> {
    const v = (await this.request("/execute", {
      schemaVersion: 1,
      ...input,
    })) as Partial<DevnetRecurringExecution> | null;
    if (
      !v ||
      !["failed", "confirmed", "submitted", "unknown", "expired"].includes(
        v.status!,
      ) ||
      typeof v.signature !== "string" ||
      typeof v.explorerUrl !== "string"
    )
      throw new Error(
        "Devnet confirmation is unavailable. Keep the pending submission and check again.",
      );
    return v as DevnetRecurringExecution;
  }
}
