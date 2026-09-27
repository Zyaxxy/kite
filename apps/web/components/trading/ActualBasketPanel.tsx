"use client";
import { useEffect, useRef, useState } from "react";
import {
  BASE_SWAP_TOKENS,
  MAINNET_USDC_MINT,
  fromTokenAmount,
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
  ]);
  useEffect(() => {
    if (flow.confirmedBundleRevision > 0) balances.refresh();
  }, [flow.confirmedBundleRevision, balances.refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const disabled = quoting || flow.busy || flow.pending;
  async function review() {
    if (disabled || !auth.walletAddress) return;
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
          signing. Larger baskets use a Jito bundle; small baskets use one
          transaction.
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
        <span>Amount in {token.symbol}</span>
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
        <select
          value={slippage}
          disabled={disabled}
          onChange={(e) => setSlippage(e.target.value)}
        >
          <option value="50">0.5%</option>
          <option value="100">1%</option>
          <option value="200">2%</option>
          <option value="300">3%</option>
        </select>
      </label>
      {order && (
        <div className="stack" style={{ gap: 10 }}>
          <p className="eyebrow">Minimum received</p>
          {"kind" in order && order.kind === "bundle" ? (
            <div className="notice" role="note">
              <div>
                <strong>
                  {order.transactions.length} transactions · one bundle
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
              One atomic transaction. If a swap fails, the purchase reverts;
              network fees may still apply.
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
            Pay {fromTokenAmount(order.inAmount, order.inputDecimals)}{" "}
            {token.symbol}. Priority fee up to {order.priorityFeeLamports / 1e9}{" "}
            SOL, plus network fees and any new token-account rent. Review the
            total in your wallet.
          </p>
          <button
            className="btn full"
            disabled={disabled || !auth.canSignV0 || order.expiresAt <= now}
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
          disabled={disabled || !auth.canSignV0 || !amount}
          onClick={review}
        >
          {quoting
            ? "Building your complete basket…"
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
      {auth.walletAddress && !auth.canSignV0 && (
        <p className="notice">
          This wallet does not advertise v0 signing. Update it or connect a
          compatible wallet to buy.
        </p>
      )}
      {balances.error && <p className="fineprint">{balances.error}</p>}
      <TransactionFeedback flow={flow} />
    </section>
  );
}
