"use client";
import { useEffect, useRef, useState } from "react";
import {
  BASE_SWAP_TOKENS,
  MAINNET_USDC_MINT,
  MAINNET_SOL_MINT,
  fromTokenAmount,
  type RecurringPayment,
  type WalletTransactionOrder,
} from "@kite/sdk";
import { SwapTokenSelector } from "./SwapTokenSelector";
import { useWalletPortfolio } from "./useWalletPortfolio";
import {
  useComposedTransaction,
  TransactionFeedback,
} from "./useComposedTransaction";
import { kiteClient } from "../kite/api-client";

export function RecurringPaymentsPanel() {
  const flow = useComposedTransaction(),
    { auth } = flow,
    balances = useWalletPortfolio(auth.walletAddress);
  const [token, setToken] = useState(
      BASE_SWAP_TOKENS.find((t) => t.mint === MAINNET_USDC_MINT)!,
    ),
    [amount, setAmount] = useState(""),
    [buyer, setBuyer] = useState(""),
    [period, setPeriod] = useState("604800"),
    [periods, setPeriods] = useState("4"),
    [consent, setConsent] = useState(false);
  const [items, setItems] = useState<RecurringPayment[]>([]),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(""),
    [preparing, setPreparing] = useState(false),
    [revision, setRevision] = useState(0);
  const [review, setReview] = useState<{
      order: WalletTransactionOrder;
      payment?: RecurringPayment;
      decimals?: number;
      action: "create" | "revoke";
    } | null>(null),
    [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setReview(null);
    setConsent(false);
  }, [buyer, amount, period, periods, token.mint, auth.walletAddress]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setItems([]);
    setLoadError("");
    if (!auth.walletAddress) return;
    const controller = new AbortController();
    setLoading(true);
    kiteClient
      .getRecurringPayments(auth.walletAddress, controller.signal)
      .then((v) => {
        if (!controller.signal.aborted) setItems(v);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setLoadError(
            e instanceof Error ? e.message : "Could not load permissions.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [auth.walletAddress, revision]);
  const disabled = flow.busy || preparing || flow.pending;
  async function prepare(delegation?: string) {
    if (!auth.walletAddress || disabled) return;
    const current = generation.current;
    setPreparing(true);
    setReview(null);
    flow.setMessage("");
    try {
      if (delegation) {
        const order = await kiteClient.revokeRecurringPayment(
          auth.walletAddress,
          delegation,
          auth.supportedTransactionVersions,
        );
        if (current === generation.current)
          setReview({ order, action: "revoke" });
      } else {
        const order = await kiteClient.requestRecurringPayment({
          taker: auth.walletAddress,
          buyer: buyer.trim(),
          mint: token.mint,
          amount,
          periodSeconds: Number(period),
          periods: Number(periods),
          supportedTransactionVersions: auth.supportedTransactionVersions,
        });
        if (current === generation.current)
          setReview({
            order,
            payment: order.payment,
            decimals: order.decimals,
            action: "create",
          });
      }
    } catch (e) {
      if (current === generation.current)
        flow.setMessage(
          e instanceof Error ? e.message : "Unable to prepare this permission.",
        );
    } finally {
      setPreparing(false);
    }
  }
  return (
    <div className="plan-layout">
      <div className="stack">
        <div className="section-head" style={{ margin: 0 }}>
          <h2>Your payment permissions</h2>
          <button
            className="text-link"
            disabled={loading}
            onClick={() => setRevision((r) => r + 1)}
          >
            Refresh
          </button>
        </div>
        <p className="fineprint">
          Permissions are read from your wallet’s onchain records. Your buyer
          runs the collection schedule. Kite does not hold your tokens or a
          buyer signing key.
        </p>
        {loading ? (
          <p role="status">Reading permissions…</p>
        ) : loadError ? (
          <p className="notice" role="alert">
            {loadError}
          </p>
        ) : items.length === 0 ? (
          <div className="panel">
            <h3>
              {auth.walletAddress
                ? "No recurring permissions"
                : "Connect to view your permissions"}
            </h3>
            <p className="fineprint">
              Choose a buyer, an amount and an expiry to authorize recurring
              token payments.
            </p>
          </div>
        ) : (
          items.map((p) => {
            const holding = balances.portfolio?.holdings.find(
                (h) => h.mint === p.mint,
              ),
              base = BASE_SWAP_TOKENS.find((t) => t.mint === p.mint),
              decimals = holding?.decimals ?? base?.decimals;
            return (
              <div className="panel stack" style={{ gap: 12 }} key={p.address}>
                <div className="flex-between">
                  <h3>
                    {decimals == null
                      ? `${p.amountPerPeriod} base units`
                      : fromTokenAmount(p.amountPerPeriod, decimals)}{" "}
                    {holding?.symbol ?? base?.symbol ?? "tokens"}
                  </h3>
                  <span className="badge">
                    {p.expiresAt && p.expiresAt * 1000 <= now
                      ? "EXPIRED"
                      : "PERMISSION"}
                  </span>
                </div>
                <p className="fineprint">
                  Every {p.periodSeconds / 86400} days ·{" "}
                  {p.expiresAt
                    ? `Expires ${new Date(p.expiresAt * 1000).toLocaleDateString()}`
                    : "No expiry"}
                </p>
                <p className="fineprint" style={{ overflowWrap: "anywhere" }}>
                  Buyer: {p.buyer}
                  <br />
                  Token: {p.mint}
                </p>
                <div className="flex-between">
                  <a
                    className="text-link"
                    href={`https://solscan.io/account/${p.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View permission
                  </a>
                  <button
                    className="btn secondary"
                    disabled={disabled || !auth.canSignV1}
                    onClick={() => prepare(p.address)}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <aside className="panel stack" style={{ gap: 16, alignSelf: "start" }}>
        <div>
          <p className="eyebrow">Recurring payments</p>
          <h2>Set a spending limit.</h2>
        </div>
        <p className="fineprint">
          One wallet approval authorizes a buyer to collect tokens each period
          until expiry. Each collection is signed by the buyer.
        </p>
        <SwapTokenSelector
          label="Funding token"
          token={token}
          otherMint={MAINNET_SOL_MINT}
          disabled={disabled}
          onChange={setToken}
          holdings={balances.portfolio?.holdings}
          balancesLoading={balances.loading}
          walletConnected={Boolean(auth.walletAddress)}
        />
        <label className="form-field">
          <span>Buyer’s Solana wallet</span>
          <input
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            maxLength={44}
            disabled={disabled}
            placeholder="Buyer or payment service address"
            spellCheck={false}
          />
        </label>
        <label className="form-field">
          <span>Maximum {token.symbol} per period</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            maxLength={40}
            disabled={disabled}
            placeholder="0.00"
          />
        </label>
        <label className="form-field">
          <span>Payment period</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={disabled}
          >
            <option value="86400">Every day</option>
            <option value="604800">Every week</option>
            <option value="2592000">Every 30 days</option>
          </select>
        </label>
        <label className="form-field">
          <span>Number of periods</span>
          <input
            type="number"
            min={1}
            max={365}
            value={periods}
            onChange={(e) => setPeriods(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label
          className="fineprint"
          style={{ display: "flex", gap: 10, alignItems: "start" }}
        >
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={disabled}
            style={{ marginTop: 3 }}
          />
          <span>
            I trust this buyer to withdraw up to the stated limit each period.
            This permission does not enforce stock purchases or delivery. The
            shared program receives the token delegate permission; its onchain
            records enforce the buyer’s limits. I can revoke it.
          </span>
        </label>
        {review && (
          <div className="notice" style={{ display: "block" }}>
            {review.payment ? (
              <>
                <strong>Review payment permission</strong>
                <p style={{ overflowWrap: "anywhere" }}>
                  Buyer: {review.payment.buyer}
                </p>
                <p>
                  Up to{" "}
                  {fromTokenAmount(
                    review.payment.amountPerPeriod,
                    review.decimals!,
                  )}{" "}
                  {token.symbol} every {review.payment.periodSeconds / 86400}{" "}
                  days, starting when confirmed. Expires{" "}
                  {new Date(review.payment.expiresAt * 1000).toLocaleString()}.
                </p>
                <p>No deposit or vault. Network fees and account rent apply.</p>
              </>
            ) : (
              <p>
                Revoke this permission and return its account rent. Previously
                collected payments cannot be reversed.
              </p>
            )}
            <button
              className="btn full"
              disabled={
                disabled ||
                review.order.expiresAt <= now ||
                (review.action === "create" && !consent)
              }
              onClick={async () => {
                if (await flow.execute(review.order)) {
                  setRevision((r) => r + 1);
                  balances.refresh();
                }
                setReview(null);
              }}
            >
              {flow.busy
                ? "Confirming…"
                : review.order.expiresAt <= now
                  ? "Review expired"
                  : review.action === "revoke"
                    ? "Approve revocation"
                    : "Approve recurring permission"}
            </button>
          </div>
        )}
        {!auth.walletAddress && auth.privyConfigured ? (
          <button className="btn full" onClick={auth.login}>
            Sign in to set up payments
          </button>
        ) : (
          <button
            className="btn secondary full"
            disabled={
              disabled || !auth.canSignV1 || !amount || !buyer || !consent
            }
            onClick={() => prepare()}
          >
            {preparing ? "Preparing…" : "Review permission"}
          </button>
        )}
        {!auth.walletAddress && (
          <p className="fineprint">
            Connect a wallet in the header or sign in to continue.
          </p>
        )}
        <TransactionFeedback flow={flow} />
      </aside>
    </div>
  );
}
