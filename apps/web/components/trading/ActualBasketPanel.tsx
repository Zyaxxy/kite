"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BASE_SWAP_TOKENS,
  MAINNET_USDC_MINT,
  fromTokenAmount,
  basketInputDebitBounds,
  maxSwapAmount,
  type BasketPurchaseOrder,
  type MarketBasket,
} from "@kite/sdk";
import { SwapTokenSelector } from "./SwapTokenSelector";
import { useWalletPortfolio } from "./useWalletPortfolio";
import {
  useComposedTransaction,
  TransactionFeedback,
} from "./useComposedTransaction";
import { kiteClient } from "../kite/api-client";
import { RouteHealthReport } from "../kite/RouteHealth";
import { useRouteHealth } from "../kite/useRouteHealth";
import { NativeSelect } from "../ui/native-select";
import { MAINNET_SOL_MINT, MAINNET_USDT_MINT } from "@kite/sdk";
import styles from "./swap-tokens.module.css";

export function ActualBasketPanel({ basket }: { basket: MarketBasket }) {
  const flow = useComposedTransaction(),
    { auth } = flow;
  const balances = useWalletPortfolio(auth.walletAddress);
  const [token, setToken] = useState(
      BASE_SWAP_TOKENS.find((t) => t.mint === MAINNET_USDC_MINT)!,
    ),
    [amount, setAmount] = useState(""),
    [slippage, setSlippage] = useState("100");
  const [order, setOrder] = useState<BasketPurchaseOrder | null>(null),
    [quoting, setQuoting] = useState(false),
    [now, setNow] = useState(Date.now());
  const revision = useRef(0);
  const allocationKey = basket.assets
    .map(({ asset, weight }) => `${asset.mint}:${weight}`)
    .join("|");
  const signingVersionsKey = auth.supportedTransactionVersions.join(",");
  useEffect(() => {
    revision.current++;
    setOrder(null);
  }, [
    basket.id,
    allocationKey,
    token.mint,
    amount,
    slippage,
    auth.walletAddress,
    signingVersionsKey,
  ]);
  useEffect(() => {
    if (flow.confirmedBundleRevision > 0) balances.refresh();
  }, [flow.confirmedBundleRevision, balances.refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const routeInput =
    Number(amount) > 0 &&
    [MAINNET_USDC_MINT, MAINNET_USDT_MINT, MAINNET_SOL_MINT].includes(
      token.mint,
    )
      ? {
          inputMint: token.mint,
          amount,
          slippageBps: Number(slippage),
          basketId: basket.id,
          allocations:
            basket.isCustom && !basket.id.startsWith("creator-")
              ? basket.assets.map(({ asset, weight }) => ({
                  mint: asset.mint,
                  weightBps: Math.round(weight),
                }))
              : undefined,
        }
      : null;
  const routeHealth = useRouteHealth(routeInput);
  const disabled = quoting || flow.busy || flow.pending;
  const selectedHolding = balances.portfolio?.holdings.find(
    (holding) => holding.mint === token.mint,
  );
  const availableAmount = selectedHolding
    ? maxSwapAmount(selectedHolding)
    : token.mint === MAINNET_USDC_MINT
      ? balances.portfolio?.usdcBalance ?? "0"
      : "0";
  const tokenPriceUsd =
    token.priceUsd ??
    (token.mint === MAINNET_USDC_MINT || token.mint === MAINNET_USDT_MINT
      ? 1
      : null);
  const availableUsd =
    tokenPriceUsd === null ? null : Number(availableAmount) * tokenPriceUsd;
  const suggestedUsd =
    availableUsd !== null && Number.isFinite(availableUsd) && availableUsd > 0
      ? Math.min(
          Math.floor(availableUsd / 10) * 10,
          Math.max(
            basket.assets.length * 10,
            Math.ceil((availableUsd * 0.1) / 10) * 10,
          ),
        )
      : 0;
  const suggestedAmount = suggestedUsd > 0 ? suggestedUsd / tokenPriceUsd! : null;
  const suggestedDisplay = suggestedAmount
    ? suggestedAmount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
    : null;
  async function review() {
    if (disabled || routeHealth.loading || !auth.walletAddress) return;
    const requestRevision = revision.current;
    setQuoting(true);
    setOrder(null);
    flow.setMessage("");
    try {
      const value = await kiteClient.requestBasketOrder({
        basketId: basket.id,
        inputMint: token.mint,
        amount,
        taker: auth.walletAddress,
        slippageBps: Number(slippage),
        supportedTransactionVersions: auth.supportedTransactionVersions,
        customAllocations:
          basket.isCustom && !basket.id.startsWith("creator-")
            ? basket.assets.map((a) => ({
                mint: a.asset.mint,
                weightBps: Math.round(a.weight),
              }))
            : undefined,
      });
      if (requestRevision === revision.current) setOrder(value);
    } catch (e) {
      if (requestRevision === revision.current)
        flow.setMessage(
          e instanceof Error
            ? e.message
            : "Unable to quote the complete basket.",
        );
    } finally {
      setQuoting(false);
    }
  }
  return (
    <section
      className="stack"
      style={{ gap: 16 }}
      aria-label="Review basket purchase"
    >
      <div>
        <h3>Your basket, in your wallet.</h3>
        <p className="fineprint">
          Review the complete allocation, fees and transaction count before
          signing. The review selects a single transaction when it fits, or a
          Jito bundle when more capacity is needed.
        </p>
      </div>
      <SwapTokenSelector
        label="Pay with"
        token={token}
        otherMint=""
        disabled={disabled}
        onChange={setToken}
        holdings={balances.portfolio?.holdings}
        walletConnected={Boolean(auth.walletAddress)}
        balancesLoading={balances.loading}
      />
      <label className="form-field">
        <span className="flex-between">
          <span>Amount in {token.symbol}</span>
          {suggestedDisplay && (
            <span className={styles.amountSuggestion}>
              <small>Suggested</small>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Use suggested amount ${suggestedDisplay} ${token.symbol}`}
                onClick={() => setAmount(suggestedDisplay)}
              >
                {suggestedDisplay}
              </button>
            </span>
          )}
        </span>
        <input
          inputMode="decimal"
          name="basket-amount"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          maxLength={40}
          disabled={disabled}
          placeholder="0.00"
        />
      </label>
      <label className="form-field">
        <span>Maximum slippage per asset</span>
        <NativeSelect
          value={slippage}
          disabled={disabled}
          onChange={(e) => setSlippage(e.target.value)}
        >
          <option value="50">0.5%</option>
          <option value="100">1%</option>
          <option value="200">2%</option>
          <option value="300">3%</option>
        </NativeSelect>
      </label>
      <RouteHealthReport input={routeInput} {...routeHealth} />
      {order && (
        <div className="stack" style={{ gap: 10 }}>
          <p className="eyebrow">Minimum received</p>
          {"kind" in order && order.kind === "bundle" ? (
            <div className="notice" role="note">
              <div>
                <strong>
                  {order.transactions.length} V{order.transactionVersion}{" "}
                  transactions · Jito bundle
                </strong>
                <p>{order.atomicityWarning}</p>
                <p>
                  Jito tip: {order.tipLamports / 1e9} SOL. Your wallet may
                  request each approval separately.
                </p>
              </div>
            </div>
          ) : (
            <p className="fineprint">
              One atomic V{order.transactionVersion} transaction · no Jito tip.
              If a swap fails, the purchase reverts; network fees may still
              apply.
            </p>
          )}
          {order.outputs.map((output) => (
            <div className="flex-between" key={output.mint}>
              <span>
                {output.symbol}
                {output.mint === order.inputMint ? " · retained" : ""}
              </span>
              <strong>
                {fromTokenAmount(output.minimumAmount, output.decimals)}
              </strong>
            </div>
          ))}
          <p className="fineprint">
            Pay up to {fromTokenAmount(
              order.inputMint === MAINNET_SOL_MINT
                ? order.inAmount
                : basketInputDebitBounds(BigInt(order.inAmount)).maximum.toString(),
              order.inputDecimals,
            )}{" "}
            {token.symbol}. Priority fee up to {order.priorityFeeLamports / 1e9}{" "}
            SOL, plus network fees and any new token-account rent. Review the
            total in your wallet.
          </p>
          <button
            className="btn full"
            disabled={
              disabled ||
              !auth.supportedTransactionVersions.includes(
                order.transactionVersion,
              ) ||
              order.expiresAt <= now
            }
            onClick={async () => {
              if (await flow.execute(order)) balances.refresh();
              setOrder(null);
            }}
          >
            {flow.busy
              ? "Confirming…"
              : order.expiresAt <= now
                ? "Review expired"
                : "Approve & buy basket"}
          </button>
        </div>
      )}
      {!auth.walletAddress && auth.privyConfigured ? (
        <button className="btn full" onClick={auth.login}>
          Sign in to buy
        </button>
      ) : (
        <button
          className={`btn ${order ? "secondary" : ""} full`}
          disabled={disabled || routeHealth.loading || !auth.canSign || !amount}
          onClick={review}
        >
          {quoting
            ? "Building your complete basket…"
            : routeHealth.loading
              ? "Waiting for route check…"
              : order
                ? "Refresh review"
                : "Review basket purchase"}
        </button>
      )}
      {!auth.walletAddress && (
        <p className="fineprint">
          Sign in or connect a wallet in the header to buy with your tokens.
        </p>
      )}
      {auth.walletAddress && !auth.canSign && (
        <p className="notice">
          This wallet does not advertise compatible transaction signing. Update
          it or connect a compatible wallet to buy.
        </p>
      )}
      {balances.error && <p className="fineprint">{balances.error}</p>}
      <TransactionFeedback flow={flow} />
      {flow.message?.startsWith("No Jupiter route from ") ? (
        <Link href="/baskets" className="text-link">
          Browse other baskets
        </Link>
      ) : null}
    </section>
  );
}
