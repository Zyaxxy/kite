"use client";
import { useEffect, useRef, useState } from "react";
import {
  BASE_SWAP_TOKENS,
  MAINNET_USDC_MINT,
  fromTokenAmount,
  type BasketOrder,
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
  const [order, setOrder] = useState<BasketOrder | null>(null),
    [quoting, setQuoting] = useState(false),
    [now, setNow] = useState(Date.now());
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setOrder(null);
  }, [basket.id, token.mint, amount, slippage, auth.walletAddress]);
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
      aria-label="Buy basket with one approval"
    >
      <div>
        <h3>One basket. One approval.</h3>
        <p className="fineprint">
          All assets settle directly to your wallet in one transaction. If any
          swap fails, the entire purchase reverts; network fees may still apply.
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
            disabled={disabled || !auth.canSignV1 || order.expiresAt <= now}
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
          disabled={disabled || !auth.canSignV1 || !amount}
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
      {auth.walletAddress && !auth.canSignV1 && (
        <p className="notice">
          This wallet does not advertise V1 signing. Update it or connect a
          compatible wallet to buy.
        </p>
      )}
      {balances.error && <p className="fineprint">{balances.error}</p>}
      <TransactionFeedback flow={flow} />
    </section>
  );
}
