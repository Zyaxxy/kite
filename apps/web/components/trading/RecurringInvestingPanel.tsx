"use client";

import { useEffect, useRef, useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  fromTokenAmount,
  MAINNET_SOL_MINT,
  maxSwapAmount,
  nextScheduleOccurrence,
  parseUtcScheduleInput,
  recurringScheduleLabel,
  scheduleAt,
  utcScheduleInput,
  type RecurringInvestmentReceipt,
  type RecurringInvestmentConfig,
  type RecurringInvestmentPlan,
  type RecurringInvestmentSchedule,
  type WalletTransactionOrder,
} from "@kite/sdk";
import { useKite } from "../kite/State";
import { kiteClient } from "../kite/api-client";
import { useWalletPortfolio } from "./useWalletPortfolio";
import {
  TransactionFeedback,
  useComposedTransaction,
} from "./useComposedTransaction";

const date = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " UTC";
const units = (plan: RecurringInvestmentPlan, count = 1) =>
  fromTokenAmount(
    (BigInt(plan.amountUnits) * BigInt(count)).toString(),
    plan.fundingDecimals,
  );

/** Investment intent stays distinct from the underlying token payment permission. */
export function RecurringInvestingPanel() {
  const { snapshot } = useKite();
  const flow = useComposedTransaction();
  const { auth } = flow;
  const { setVisible } = useWalletModal();
  const balances = useWalletPortfolio(auth.walletAddress);
  const [target, setTarget] = useState("");
  const [mint, setMint] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<RecurringInvestmentSchedule["unit"]>("day");
  const [interval, setIntervalValue] = useState("1");
  const [startsAt, setStartsAt] = useState(() =>
    utcScheduleInput(Math.floor(Date.now() / 1000) + 86400),
  );
  const [occurrences, setOccurrences] = useState("12");
  const [slippage, setSlippage] = useState("100");
  const [consent, setConsent] = useState(false);
  const [config, setConfig] = useState<RecurringInvestmentConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [plans, setPlans] = useState<RecurringInvestmentPlan[]>([]);
  const [receipts, setReceipts] = useState<RecurringInvestmentReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [review, setReview] = useState<{
    order: WalletTransactionOrder;
    plan: RecurringInvestmentPlan;
    revoke?: boolean;
  } | null>(null);
  const generation = useRef(0);
  const walletRef = useRef(auth.walletAddress);
  walletRef.current = auth.walletAddress;
  const holdings =
    balances.portfolio?.holdings.filter(
      (h) => h.mint !== MAINNET_SOL_MINT && maxSwapAmount(h) !== "0",
    ) ?? [];
  const token = holdings.find((h) => h.mint === mint);
  const disabled = preparing || flow.busy || flow.pending;
  const canPrepare =
    config?.available === true && auth.canSignV1 && Boolean(token);
  const nameOf = (plan: RecurringInvestmentPlan) =>
    plan.target.type === "basket"
      ? (snapshot?.baskets.find((b) => b.id === plan.target.id)?.name ??
        plan.target.id)
      : (snapshot?.assets.find((a) => a.mint === plan.target.id)?.name ??
        plan.allocations[0]?.symbol ??
        "Stock investment");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("basket")) setTarget(`basket:${params.get("basket")}`);
    else if (params.get("stock")) setTarget(`stock:${params.get("stock")}`);
  }, []);
  useEffect(() => {
    generation.current++;
    setReview(null);
    setConsent(false);
  }, [
    target,
    mint,
    amount,
    unit,
    interval,
    startsAt,
    occurrences,
    slippage,
    auth.walletAddress,
  ]);
  useEffect(() => {
    if (!review) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [review]);
  useEffect(() => {
    if (!token && holdings[0]) setMint(holdings[0].mint);
    if (!auth.walletAddress) setMint("");
  }, [balances.portfolio, auth.walletAddress, mint]);
  useEffect(() => {
    const controller = new AbortController();
    setConfigError("");
    kiteClient
      .getInvestmentConfig(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setConfig(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setConfig(null);
          setConfigError(
            error instanceof Error
              ? error.message
              : "Could not check recurring investing availability.",
          );
        }
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    setPlans([]);
    setReceipts([]);
    setLoadError("");
    if (!auth.walletAddress) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    kiteClient
      .getInvestmentPlans(auth.walletAddress, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setPlans(value.plans);
          setReceipts(value.receipts);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load your investments.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [auth.walletAddress, revision]);

  async function prepare(revoke?: RecurringInvestmentPlan) {
    if (!auth.walletAddress || disabled || !auth.canSignV1) return;
    const current = generation.current;
    setPreparing(true);
    setReview(null);
    flow.setMessage("");
    try {
      if (revoke) {
        const order = await kiteClient.revokeRecurringPayment(
          auth.walletAddress,
          revoke.delegation,
          auth.supportedTransactionVersions,
        );
        if (current === generation.current)
          setReview({ order, plan: revoke, revoke: true });
      } else {
        const [type, id] = target.split(":");
        if ((type !== "basket" && type !== "stock") || !id)
          throw new Error("Choose a basket or stock for this investment.");
        if (!token) throw new Error("Choose a funded token from your wallet.");
        const response = await kiteClient.requestInvestmentPlan({
          action: "create",
          taker: auth.walletAddress,
          target: { type, id },
          fundingMint: mint,
          amount,
          slippageBps: Number(slippage),
          consent: true,
          schedule: {
            unit,
            interval: Number(interval),
            startsAt: parseUtcScheduleInput(startsAt),
            occurrences: Number(occurrences),
          },
          supportedTransactionVersions: auth.supportedTransactionVersions,
        });
        if (!config?.executor || response.plan.buyer !== config.executor)
          throw new Error(
            "The executor changed while preparing your plan. Check availability and review again.",
          );
        if (current === generation.current) setReview(response);
      }
    } catch (error) {
      if (current === generation.current)
        flow.setMessage(
          error instanceof Error
            ? error.message
            : "Could not prepare this investment. Your inputs have been kept.",
        );
    } finally {
      setPreparing(false);
    }
  }
  async function confirm() {
    if (
      !review ||
      disabled ||
      (!review.revoke && (!consent || review.plan.buyer !== config?.executor))
    )
      return;
    const wallet = auth.walletAddress;
    const confirmed = await flow.execute(review.order);
    if (confirmed && walletRef.current === wallet) {
      const wasRevoke = review.revoke;
      setReview(null);
      setConsent(false);
      setRevision((v) => v + 1);
      balances.refresh();
      flow.setMessage(
        wasRevoke
          ? "Permission revoked. No future investments are authorized by this plan."
          : "Permission confirmed. Your plan activates after its onchain terms have been verified. Refresh your plans to check its status.",
      );
    }
  }

  return (
    <div className="investing-layout">
      <section
        className="panel investing-builder"
        aria-labelledby="investment-builder-title"
      >
        <div>
          <p className="eyebrow">Your investment, your rhythm</p>
          <h2 id="investment-builder-title">Make room for consistency.</h2>
        </div>
        <p className="fineprint">
          Choose a basket or a single stock. Set how often to invest, when to
          start and when to stop.
        </p>
        {!config && !configError ? (
          <p role="status" className="fineprint">
            Checking recurring investing availability…
          </p>
        ) : null}
        {(configError || (config && !config.available)) && (
          <div className="notice investing-notice" role="status">
            <p>
              {configError ||
                config?.reason ||
                "Recurring investing is not enabled for this deployment yet."}
            </p>
            <button
              type="button"
              className="text-link"
              onClick={() => setRevision((v) => v + 1)}
            >
              Check again
            </button>
          </div>
        )}
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void prepare();
          }}
        >
          <fieldset className="investing-fields" disabled={disabled}>
            <label className="form-field">
              Invest in
              <select
                required
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="">Choose a basket or stock</option>
                <optgroup label="Thematic baskets">
                  {snapshot?.baskets.map((basket) => (
                    <option key={basket.id} value={`basket:${basket.id}`}>
                      {basket.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Individual stocks and ETFs">
                  {snapshot?.assets
                    .filter((asset) => !asset.tradingHalted)
                    .map((asset) => (
                      <option key={asset.mint} value={`stock:${asset.mint}`}>
                        {asset.symbol} · {asset.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
            <label className="form-field">
              Pay with tokens in your wallet
              <select
                required
                value={mint}
                onChange={(event) => setMint(event.target.value)}
                disabled={
                  !auth.walletAddress || (balances.loading && !holdings.length)
                }
              >
                <option value="">
                  {!auth.walletAddress
                    ? "Connect to see your tokens"
                    : balances.loading
                      ? "Reading balances…"
                      : "Choose a funding token"}
                </option>
                {holdings.map((holding) => (
                  <option key={holding.mint} value={holding.mint}>
                    {holding.symbol} · {holding.amount} available
                  </option>
                ))}
              </select>
            </label>
            {balances.error && (
              <p className="fineprint" role="alert">
                {balances.error}{" "}
                <button
                  type="button"
                  className="text-link"
                  onClick={balances.refresh}
                >
                  Retry balances
                </button>
              </p>
            )}
            {auth.walletAddress &&
              !balances.loading &&
              !balances.error &&
              !holdings.length && (
                <p className="fineprint">
                  Your wallet needs a funded SPL token. Native SOL cannot be
                  delegated for recurring purchases.
                </p>
              )}
            <label className="form-field">
              Amount per investment{token ? ` (${token.symbol})` : ""}
              <input
                required
                type="text"
                inputMode="decimal"
                autoComplete="off"
                pattern="[0-9]+([.][0-9]+)?"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <div className="investing-field-row">
              <label className="form-field">
                Repeat every
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="([1-9]|1[0-2])"
                  title="Choose an interval from 1 to 12"
                  value={interval}
                  onChange={(event) => setIntervalValue(event.target.value)}
                />
              </label>
              <label className="form-field">
                Frequency
                <select
                  value={unit}
                  onChange={(event) =>
                    setUnit(
                      event.target.value as RecurringInvestmentSchedule["unit"],
                    )
                  }
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Calendar month</option>
                </select>
              </label>
            </div>
            <label className="form-field">
              First investment (UTC)
              <input
                required
                type="datetime-local"
                autoComplete="off"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                aria-describedby="investment-time-help"
              />
            </label>
            <p id="investment-time-help" className="fineprint">
              Times use UTC. Monthly plans keep your chosen day, or the last day
              of a shorter month. Missed purchases are skipped after six hours.
            </p>
            <div className="investing-field-row">
              <label className="form-field">
                Number of investments
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[1-9][0-9]{0,2}"
                  value={occurrences}
                  onChange={(event) => setOccurrences(event.target.value)}
                />
              </label>
              <label className="form-field">
                Maximum slippage
                <select
                  value={slippage}
                  onChange={(event) => setSlippage(event.target.value)}
                >
                  <option value="50">0.5%</option>
                  <option value="100">1%</option>
                  <option value="200">2%</option>
                  <option value="300">3%</option>
                </select>
              </label>
            </div>
            <p className="fineprint">
              Up to 365 investments over one year. Each run needs available
              funds and executable routes. You can revoke future purchases at
              any time.
            </p>
          </fieldset>
          {auth.walletAddress && !auth.canSignV1 && (
            <p className="notice" role="status">
              Your connected wallet does not advertise V1 signing. Connect a
              wallet with V1 support to approve a plan.
            </p>
          )}
          {!auth.walletAddress ? (
            <button
              type="button"
              className="btn full"
              onClick={() => setVisible(true)}
            >
              Connect wallet to continue
            </button>
          ) : (
            <button
              type="submit"
              className="btn full"
              disabled={disabled || !canPrepare}
              aria-busy={preparing}
            >
              {preparing ? "Preparing your plan…" : "Review investment plan"}
            </button>
          )}
          {auth.privyConfigured && !auth.walletAddress && (
            <button type="button" className="text-link" onClick={auth.login}>
              Sign in with Privy
            </button>
          )}
        </form>
        {review && (
          <section
            className="investing-review stack"
            aria-labelledby="investment-review-title"
          >
            <h3 id="investment-review-title">
              {review.revoke
                ? "End future purchases"
                : "Review your permission"}
            </h3>
            <p>
              <strong>{nameOf(review.plan)}</strong>
              <br />
              {units(review.plan)} {review.plan.fundingSymbol} ·{" "}
              {recurringScheduleLabel(review.plan.schedule)}
            </p>
            {review.revoke ? (
              <p className="fineprint">
                Revocation ends this plan’s future authorization. Purchases
                already completed cannot be reversed.
              </p>
            ) : (
              <>
                <dl className="investing-summary">
                  <div>
                    <dt>First purchase</dt>
                    <dd>{date(review.plan.schedule.startsAt)}</dd>
                  </div>
                  <div>
                    <dt>Last scheduled purchase</dt>
                    <dd>
                      {date(
                        scheduleAt(
                          review.plan.schedule,
                          review.plan.schedule.occurrences - 1,
                        ),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Scheduled investments</dt>
                    <dd>{review.plan.schedule.occurrences}</dd>
                  </div>
                  <div>
                    <dt>Total scheduled funding</dt>
                    <dd>
                      {units(review.plan, review.plan.schedule.occurrences)}{" "}
                      {review.plan.fundingSymbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Maximum authorized withdrawals</dt>
                    <dd>{review.plan.permission.maximumCollections}</dd>
                  </div>
                  <div>
                    <dt>Maximum authorized funding</dt>
                    <dd>
                      {units(
                        review.plan,
                        review.plan.permission.maximumCollections,
                      )}{" "}
                      {review.plan.fundingSymbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Permission expires</dt>
                    <dd>{date(review.plan.permission.expiresAt)}</dd>
                  </div>
                </dl>
                {review.plan.permission.maximumCollections >
                  review.plan.schedule.occurrences && (
                  <p className="notice">
                    The fixed onchain withdrawal periods allow more collections
                    than your calendar schedule. The maximum authorized funding
                    above is your actual exposure.
                  </p>
                )}
                <p className="fineprint">
                  The executor is authorized to withdraw funding tokens. Kite’s
                  executor combines collection, swaps and delivery in one
                  transaction, but the subscription program does not enforce
                  stock delivery against a malicious executor. Setup network
                  fees and rent apply.
                </p>
                <a
                  className="text-link"
                  href={`https://solscan.io/account/${review.plan.buyer}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect the executor wallet
                </a>
                <label className="investing-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={disabled}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    I trust this executor with the stated withdrawal limit and
                    understand that the program does not guarantee stock
                    delivery.
                  </span>
                </label>
              </>
            )}
            <button
              type="button"
              className="btn full"
              disabled={
                disabled ||
                !auth.canSignV1 ||
                review.order.expiresAt <= now ||
                (!review.revoke && !consent)
              }
              onClick={() => {
                void confirm();
              }}
            >
              {flow.busy
                ? "Waiting for confirmation…"
                : review.order.expiresAt <= now
                  ? "Review expired — prepare again"
                  : review.revoke
                    ? "Approve revocation"
                    : "Approve recurring investment"}
            </button>
            <button
              type="button"
              className="btn ghost full"
              disabled={disabled}
              onClick={() => setReview(null)}
            >
              Cancel review
            </button>
          </section>
        )}
        <TransactionFeedback flow={flow} />
      </section>
      <section className="stack" aria-labelledby="investment-plans-title">
        <div className="section-head">
          <h2 id="investment-plans-title">Your recurring investments</h2>
          <button
            type="button"
            className="text-link"
            disabled={loading}
            onClick={() => setRevision((v) => v + 1)}
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="panel" role="status">
            Reading your plans and confirming their permissions…
          </div>
        ) : loadError ? (
          <div className="notice" role="alert">
            {loadError}
          </div>
        ) : !plans.length ? (
          <div className="panel stack">
            <h3>
              {auth.walletAddress
                ? "Your first plan starts here."
                : "Connect to see your plans."}
            </h3>
            <p className="fineprint">
              Your upcoming investments and purchase receipts appear here after
              you approve a plan. A draft is not an active investment.
            </p>
          </div>
        ) : (
          plans.map((plan) => (
            <article key={plan.id} className="panel stack">
              <div className="flex-between">
                <h3>{nameOf(plan)}</h3>
                <span
                  className={`badge ${plan.status === "active" ? "lime" : ""}`}
                >
                  {plan.status}
                </span>
              </div>
              <p>
                {units(plan)} {plan.fundingSymbol} ·{" "}
                {recurringScheduleLabel(plan.schedule)}
              </p>
              <p className="fineprint">
                {plan.schedule.occurrences} scheduled investments · Starts{" "}
                {date(plan.schedule.startsAt)}
              </p>
              {plan.status === "active" && (
                <p className="fineprint">
                  {(() => {
                    const next = nextScheduleOccurrence(
                      plan.schedule,
                      Math.floor(Date.now() / 1000),
                      { inclusive: true },
                    );
                    return next
                      ? `Next scheduled: ${date(next.scheduledAt)}`
                      : "No future installments scheduled. Check the receipts for the last run.";
                  })()}
                </p>
              )}
              <p className="fineprint">
                Maximum permission:{" "}
                {units(plan, plan.permission.maximumCollections)}{" "}
                {plan.fundingSymbol} until {date(plan.permission.expiresAt)}.
              </p>
              {plan.status === "draft" && (
                <p className="fineprint">
                  Awaiting confirmation of the matching onchain permission. No
                  scheduled purchase will run while this plan is a draft.
                </p>
              )}
              <div className="flex-between">
                <a
                  className="text-link"
                  href={`https://solscan.io/account/${plan.delegation}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View permission
                </a>
                {plan.status !== "revoked" && plan.status !== "draft" && (
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={disabled || !auth.canSignV1}
                    onClick={() => {
                      void prepare(plan);
                    }}
                  >
                    Revoke plan
                  </button>
                )}
              </div>
            </article>
          ))
        )}
        <h3>Purchase receipts</h3>
        {!receipts.length ? (
          <p className="fineprint">
            No recorded purchases yet. Upcoming plans become receipts only after
            the executor attempts an investment.
          </p>
        ) : (
          receipts.map((receipt) => {
            const plan = plans.find((item) => item.id === receipt.planId);
            return (
              <article className="panel stack" key={receipt.runId}>
                <div className="flex-between">
                  <h3>{plan ? nameOf(plan) : "Investment execution"}</h3>
                  <span
                    className={`badge ${receipt.status === "success" ? "lime" : ""}`}
                  >
                    {receipt.status === "success"
                      ? "Confirmed"
                      : receipt.status}
                  </span>
                </div>
                <p className="fineprint">
                  Scheduled {date(receipt.scheduledAt)}
                </p>
                {plan && (
                  <p className="fineprint">
                    {fromTokenAmount(receipt.amountUnits, plan.fundingDecimals)}{" "}
                    {plan.fundingSymbol} funding
                  </p>
                )}
                {receipt.error && (
                  <p className="notice" role="status">
                    {receipt.error}
                  </p>
                )}
                {receipt.status === "pending" && (
                  <p className="fineprint">
                    Confirmation is still being checked. Do not repeat this
                    investment.
                  </p>
                )}
                {receipt.status === "success" &&
                  receipt.outputs?.map((output) => (
                    <p className="fineprint" key={output.mint}>
                      Received{" "}
                      {fromTokenAmount(output.amountUnits, output.decimals)}{" "}
                      {output.symbol}
                    </p>
                  ))}
                {receipt.signature && (
                  <a
                    className="text-link"
                    href={`https://solscan.io/tx/${receipt.signature}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction
                  </a>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
