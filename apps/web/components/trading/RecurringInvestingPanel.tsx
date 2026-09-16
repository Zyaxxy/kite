"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Repeat2 } from "lucide-react";
import { fromTokenAmount, walletTransactionSignature } from "@kite/sdk";
import { useTradingAuth } from "./TradingAuth";
import { NativeSelect } from "../ui/native-select";
import recurringStyles from "./recurring-controls.module.css";

interface RecurringConfig {
  network: "devnet";
  testTokensOnly: true;
  readyToPrepare: boolean;
  reasons: string[];
  fundingSymbol: string;
  stocks: Array<{
    id: string;
    symbol: string;
    name: string;
    available: boolean;
  }>;
  baskets: Array<{
    id: string;
    name: string;
    ticker: string;
    available: boolean;
  }>;
}
interface PreparedPlan {
  network: "devnet";
  transactionVersion: 1;
  transaction: string;
  authorization: string;
  signer: string;
  plan: string;
  expiresAt: number;
  terms: {
    amount: string;
    fundingSymbol: string;
    periodSeconds: number;
    periods: number;
    startsAt: number;
    expiresAt: number;
    minimumPolicy: string;
    outputs: Array<{
      mint: string;
      symbol: string;
      decimals: number;
      weightBps: number;
      minimumAmountOut: string;
    }>;
  };
}
interface PendingPlan {
  order: PreparedPlan;
  signedTransaction: string;
}
const pendingPlanKey = (owner: string) => `kite:pending-devnet-plan:${owner}`;
function validPendingPlan(value: unknown, owner: string): value is PendingPlan {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PendingPlan>;
  const order = record.order;
  const terms = order?.terms;
  return Boolean(
    order &&
      order.signer === owner &&
      order.network === "devnet" &&
      order.transactionVersion === 1 &&
      typeof order.authorization === "string" &&
      order.authorization.length <= 4096 &&
      typeof order.transaction === "string" &&
      typeof order.plan === "string" &&
      Number.isSafeInteger(order.expiresAt) &&
      typeof record.signedTransaction === "string" &&
      record.signedTransaction.length <= 8192 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(record.signedTransaction) &&
      terms &&
      typeof terms.amount === "string" &&
      terms.amount.length <= 40 &&
      typeof terms.fundingSymbol === "string" &&
      terms.fundingSymbol.length <= 20 &&
      Number.isSafeInteger(terms.periodSeconds) &&
      Number.isSafeInteger(terms.periods) &&
      Number.isSafeInteger(terms.startsAt) &&
      terms.startsAt > 0 &&
      Number.isSafeInteger(terms.expiresAt) &&
      terms.expiresAt > terms.startsAt &&
      typeof terms.minimumPolicy === "string" &&
      Array.isArray(terms.outputs) &&
      terms.outputs.length > 0 &&
      terms.outputs.length <= 20 &&
      terms.outputs.every(
        (output) =>
          output &&
          typeof output.mint === "string" &&
          typeof output.symbol === "string" &&
          Number.isSafeInteger(output.weightBps) &&
          Number.isSafeInteger(output.decimals) &&
          output.decimals >= 0 &&
          output.decimals <= 9 &&
          typeof output.minimumAmountOut === "string" &&
          /^\d{1,20}$/.test(output.minimumAmountOut),
      ),
  );
}
async function recurringRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The devnet request could not be completed.");
  return data as T;
}

export function RecurringInvestingPanel() {
  const auth = useTradingAuth();
  const activeWallet = useRef(auth.walletAddress);
  activeWallet.current = auth.walletAddress;
  const [configRevision, setConfigRevision] = useState(0);
  const [configError, setConfigError] = useState("");
  const [config, setConfig] = useState<RecurringConfig | null>(null);
  const [selectedToken, setSelectedToken] = useState<string>("");
  const [fundingAmount, setFundingAmount] = useState<string>("10");
  const [period, setPeriod] = useState<string>("86400");
  const [periods, setPeriods] = useState<string>("10");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [explorerUrl, setExplorerUrl] = useState("");
  const [prepared, setPrepared] = useState<PreparedPlan | null>(null);
  const [pending, setPending] = useState<PendingPlan | null>(null);
  const [pendingUnreadable, setPendingUnreadable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setConfig(null);
    setConfigError("");
    fetch("/api/recurring/config", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The devnet recurring configuration is unavailable.");
        return response.json() as Promise<RecurringConfig>;
      })
      .then((data) => {
        if (
          data.network !== "devnet" ||
          data.testTokensOnly !== true ||
          !Array.isArray(data.stocks) ||
          !Array.isArray(data.baskets)
        )
          throw new Error("The recurring backend must use devnet test tokens.");
        setConfig(data);
        const stock = data.stocks.find((item) => item.available);
        const basket = data.baskets.find((item) => item.available);
        setSelectedToken(
          stock ? `stock:${stock.id}` : basket ? `basket:${basket.id}` : "",
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setConfigError(
            cause instanceof Error
              ? cause.message
              : "Unable to load devnet plans.",
          );
      });
    return () => controller.abort();
  }, [configRevision]);
  useEffect(() => {
    if (!pending) setPrepared(null);
  }, [
    selectedToken,
    fundingAmount,
    period,
    periods,
    auth.walletAddress,
    pending,
  ]);
  useEffect(() => {
    setPending(null);
    setPendingUnreadable(false);
    setPrepared(null);
    setSuccess("");
    setExplorerUrl("");
    if (!auth.walletAddress) return;
    try {
      const raw = localStorage.getItem(pendingPlanKey(auth.walletAddress));
      if (!raw) return;
      const record: unknown = JSON.parse(raw);
      if (!validPendingPlan(record, auth.walletAddress))
        throw new Error("Invalid saved devnet submission.");
      setPending(record);
      setPrepared(record.order);
      setSuccess(
        "A previous devnet submission needs a status check. Reuse its signed transaction before creating another plan.",
      );
    } catch {
      setPendingUnreadable(true);
      setError(
        "The saved devnet submission could not be read. New plans are blocked until this wallet’s pending submission is recovered. Check your devnet wallet history.",
      );
    }
  }, [auth.walletAddress]);

  const handleCreatePlan = async () => {
    const owner = auth.walletAddress;
    if (!owner) return setError("Connect wallet first.");
    if (pending || pendingUnreadable)
      return setError(
        "Resolve the saved devnet submission before creating another plan.",
      );
    if (!config?.readyToPrepare)
      return setError("Devnet recurring setup is not ready yet.");
    setError("");
    setSuccess("");
    setExplorerUrl("");
    setLoading(true);
    try {
      const [type, id] = selectedToken.split(":");
      const order = await recurringRequest<PreparedPlan>("/api/recurring", {
        schemaVersion: 1,
        owner,
        target: { type, id },
        amount: fundingAmount,
        periodSeconds: Number(period),
        periods: Number(periods),
        supportedTransactionVersions: auth.supportedTransactionVersions,
      });
      if (activeWallet.current !== owner)
        throw new Error("Wallet changed. Prepare the plan again.");
      setPrepared(order);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to prepare devnet plan.",
      );
    } finally {
      setLoading(false);
    }
  };
  const handleApprovePlan = async () => {
    const order = pending?.order ?? prepared;
    if (!order || order.signer !== auth.walletAddress)
      return setError("Prepare this plan with the connected wallet first.");
    setError("");
    setLoading(true);
    let record = pending;
    try {
      if (!record) {
        if (order.expiresAt <= Date.now())
          throw new Error(
            "The reviewed transaction expired. Prepare the plan again.",
          );
        const signedTransaction = await auth.signTransaction(
          order.transaction,
          1,
          "solana:devnet",
        );
        if (activeWallet.current !== order.signer)
          throw new Error("Wallet changed. Review the plan again.");
        const nextRecord = { order, signedTransaction };
        // Save the exact signed transaction before submission, so a lost HTTP response cannot create a second plan.
        localStorage.setItem(
          pendingPlanKey(order.signer),
          JSON.stringify(nextRecord),
        );
        record = nextRecord;
        setPending(record);
      }
      const signature = await walletTransactionSignature(
        record.signedTransaction,
      );
      setExplorerUrl(
        `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      );
      const result = await recurringRequest<{
        status: "failed" | "confirmed" | "submitted" | "unknown" | "expired";
        signature: string;
        explorerUrl: string;
      }>("/api/recurring/execute", {
        schemaVersion: 1,
        authorization: order.authorization,
        signedTransaction: record.signedTransaction,
      });
      if (["failed", "confirmed", "expired"].includes(result.status)) {
        localStorage.removeItem(pendingPlanKey(order.signer));
        if (activeWallet.current === order.signer) {
          setPending(null);
          setPrepared(null);
        }
      }
      if (activeWallet.current !== order.signer) return;
      setExplorerUrl(result.explorerUrl);
      if (result.status === "failed") {
        setError(
          "The devnet transaction failed on-chain. Review its explorer record before retrying.",
        );
        return;
      }
      if (result.status === "expired") {
        setError(
          "The previous transaction expired without a recorded execution. Prepare a fresh plan review.",
        );
        return;
      }
      setSuccess(
        result.status === "confirmed"
          ? "Devnet recurring plan confirmed."
          : "Devnet confirmation is pending. Check submission status to reuse this exact transaction; a second plan will not be created.",
      );
    } catch (cause) {
      if (record && activeWallet.current === order.signer)
        setSuccess(
          "Devnet confirmation is unavailable. Keep this saved submission and check its status before creating another plan.",
        );
      else
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to prepare the signed devnet plan.",
        );
    } finally {
      setLoading(false);
    }
  };
  const selectedDisplay = (() => {
    if (!selectedToken || !config) return "No asset selected";
    const [type, id] = selectedToken.split(":");
    if (type === "stock") {
      const stock = config.stocks.find((item) => item.id === id);
      return stock ? `${stock.name} (${stock.symbol})` : "Selected stock";
    }
    const basket = config.baskets.find((item) => item.id === id);
    return basket ? `${basket.name} (${basket.ticker})` : "Selected basket";
  })();

  return (
    <section
      className={`${recurringStyles.panel} panel stack`}
      style={{ gap: 20, scrollMarginTop: 110 }}
      aria-labelledby="guard-plan-title"
    >
      <div className={recurringStyles.header}>
        <p className="eyebrow">01 / BUILD YOUR PLAN</p>
        <h2 id="guard-plan-title">Start a recurring plan</h2>
        <p className="fineprint">
          Set the terms below. You’ll review the full plan before approving
          anything.
        </p>
      </div>
      {(configError || (config && !config.readyToPrepare)) && (
        <div className={recurringStyles.availability} role="status">
          <strong>Devnet setup is unavailable</strong>
          <p>
            {configError ||
              config?.reasons.join(" ") ||
              "The backend has not passed its configuration checks."}
          </p>
          <button
            type="button"
            className="text-link"
            onClick={() => setConfigRevision((value) => value + 1)}
          >
            Check again
          </button>
        </div>
      )}
      {!config && !configError && (
        <p className="fineprint" role="status">
          Checking devnet availability…
        </p>
      )}
      {config?.readyToPrepare && (
        <p className="fineprint">
          Configuration loaded. A wallet simulation is still required to verify
          this plan.
        </p>
      )}

      <form
        className="stack"
        style={{ gap: 20 }}
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreatePlan();
        }}
      >
        <fieldset
          className="investing-fields"
          disabled={loading || Boolean(pending) || pendingUnreadable}
        >
          <div className={recurringStyles.grid}>
            <label className="form-field">
              <span>Devnet stock or basket</span>
              <NativeSelect
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                disabled={loading || !config?.readyToPrepare}
              >
                {!selectedToken && (
                  <option value="">Select a devnet asset</option>
                )}
                <optgroup label="Stocks">
                  {config?.stocks.map((stock) => (
                    <option
                      key={stock.id}
                      value={`stock:${stock.id}`}
                      disabled={!stock.available}
                    >
                      {stock.name} ({stock.symbol})
                      {!stock.available ? " · Not provisioned" : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Baskets">
                  {config?.baskets.map((basket) => (
                    <option
                      key={basket.id}
                      value={`basket:${basket.id}`}
                      disabled={!basket.available}
                    >
                      {basket.name} ({basket.ticker})
                      {!basket.available ? " · Unavailable" : ""}
                    </option>
                  ))}
                </optgroup>
              </NativeSelect>
            </label>

            <label className="form-field">
              <span>KUSD per investment</span>
              <input
                type="number"
                required
                min="0.000001"
                step="0.000001"
                inputMode="decimal"
                autoComplete="off"
                placeholder="10.00"
                value={fundingAmount}
                onChange={(e) => setFundingAmount(e.target.value)}
                disabled={loading}
              />
            </label>
          </div>

          <div className={recurringStyles.schedule}>
            <div className={recurringStyles.scheduleHeading}>
              <span>
                <CalendarDays size={17} aria-hidden="true" /> Your schedule
              </span>
              <span>Devnet</span>
            </div>
            <div className="investing-field-row">
              <label className="form-field">
                <span>Repeat</span>
                <NativeSelect
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    setPeriods((count) =>
                      String(
                        Math.min(
                          Number(count),
                          Math.floor(31536000 / Number(e.target.value)),
                        ),
                      ),
                    );
                  }}
                  disabled={loading}
                >
                  <option value="60">Every 60 seconds · Devnet test</option>
                  <option value="86400">Every day</option>
                  <option value="604800">Every week</option>
                </NativeSelect>
              </label>

              <label className="form-field">
                <span>Number of investments</span>
                <input
                  type="number"
                  min="1"
                  required
                  max={Math.min(365, Math.floor(31536000 / Number(period)))}
                  value={periods}
                  onChange={(e) => setPeriods(e.target.value)}
                  disabled={loading}
                />
              </label>
            </div>
            <div className={recurringStyles.scheduleSummary}>
              <Repeat2 size={15} aria-hidden="true" />
              <span>
                {period === "60"
                  ? "Every 60 seconds"
                  : period === "86400"
                    ? "Every day"
                    : "Every week"}{" "}
                · {periods || "—"} planned investments
              </span>
            </div>
          </div>
        </fieldset>

        <div className={recurringStyles.overview} aria-live="polite">
          <div>
            <span>Investment</span>
            <strong>{selectedDisplay}</strong>
          </div>
          <div>
            <span>Total plan limit</span>
            <strong>
              {Number(fundingAmount) > 0 && Number(periods) > 0
                ? `${(Number(fundingAmount) * Number(periods)).toLocaleString(undefined, { maximumFractionDigits: 6 })} KUSD`
                : "—"}
            </strong>
          </div>
          <small>
            Test tokens only. Wallet fees are paid separately in devnet SOL.
          </small>
        </div>
        {prepared && (
          <div
            className="notice stack"
            style={{ gap: 10 }}
            aria-label="Review devnet plan"
          >
            <strong>Review your devnet plan</strong>
            <p className="fineprint">
              {prepared.terms.amount} {prepared.terms.fundingSymbol} per
              investment · {prepared.terms.periods} investments.
            </p>
            <p className="fineprint">
              Starts {new Date(prepared.terms.startsAt * 1000).toLocaleString()}{" "}
              · Ends{" "}
              {new Date(prepared.terms.expiresAt * 1000).toLocaleString()}.
            </p>
            <div className="stack" style={{ gap: 6 }}>
              {prepared.terms.outputs.map((output) => (
                <p className="fineprint" key={output.mint}>
                  {output.symbol}: {output.weightBps / 100}% allocation ·
                  minimum{" "}
                  {fromTokenAmount(output.minimumAmountOut, output.decimals)}{" "}
                  tokens each investment
                </p>
              ))}
            </div>
            <p className="fineprint">{prepared.terms.minimumPolicy}</p>
            <button
              className="btn full"
              type="button"
              disabled={loading}
              onClick={() => void handleApprovePlan()}
            >
              {loading
                ? "Checking devnet transaction…"
                : pending
                  ? "Check submission status"
                  : "Approve devnet plan"}
            </button>
          </div>
        )}

        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p
            className="notice"
            role="status"
            style={{ overflowWrap: "anywhere" }}
          >
            {success}{" "}
            {explorerUrl && (
              <a href={explorerUrl} target="_blank" rel="noreferrer">
                View on devnet explorer
              </a>
            )}
          </p>
        )}

        <button
          className="btn full"
          type="submit"
          aria-busy={loading}
          disabled={
            loading ||
            Boolean(pending) ||
            pendingUnreadable ||
            !auth.walletAddress ||
            !auth.canSignV1 ||
            !config?.readyToPrepare ||
            !selectedToken
          }
        >
          {loading
            ? "Preparing devnet plan…"
            : prepared
              ? "Refresh plan review"
              : "Review devnet plan"}
        </button>

        {!auth.walletAddress && (
          <p className="fineprint text-center">
            Connect your wallet to create a devnet plan.
          </p>
        )}
        {auth.walletAddress && !auth.canSignV1 && (
          <p className="fineprint text-center">
            Connect a wallet with V1 and devnet signing support to approve an
            atomic recurring plan.
          </p>
        )}
      </form>
    </section>
  );
}
