"use client";

import { useEffect, useRef, useState } from "react";
import {
  fromTokenAmount,
  BASE_SWAP_TOKENS,
  MAINNET_USDC_MINT,
  canApproveTrade,
  classifyTradeExecution,
  UNKNOWN_TRADE_MESSAGE,
  type TradableAsset,
  type MainnetTradeOrder,
  type MainnetTradeResult,
  type SwapToken,
} from "@kite/sdk";
import { WalletButton } from "./WalletButton";
import { useTradingAuth } from "./TradingAuth";
import { SwapTokenSelector } from "./SwapTokenSelector";
import styles from "./swap-tokens.module.css";

const USDC = BASE_SWAP_TOKENS.find(
  (token) => token.mint === MAINNET_USDC_MINT,
)!;
const issuerToken = (asset: TradableAsset): SwapToken => ({
  ...asset,
  source: "issuer",
  verified: true,
  logoUrl: null,
  priceUsd: null,
  tradingHalted: false,
});

const PENDING_EXECUTION_KEY = "kite:pending-mainnet-execution";
interface PendingExecution {
  walletAddress: string;
  requestId: string;
}

function persistPendingExecution(pending: PendingExecution | null) {
  try {
    if (pending)
      sessionStorage.setItem(PENDING_EXECUTION_KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(PENDING_EXECUTION_KEY);
  } catch {
    /* The active component still blocks another trade when session storage is unavailable. */
  }
}

export function ActualTradePanel({
  asset,
  className = "",
}: {
  asset: TradableAsset;
  className?: string;
}) {
  const auth = useTradingAuth();
  const [inputToken, setInputToken] = useState<SwapToken>(USDC);
  const [outputToken, setOutputToken] = useState<SwapToken>(() =>
    issuerToken(asset),
  );
  const [amount, setAmount] = useState("");
  const [order, setOrder] = useState<MainnetTradeOrder | null>(null);
  const [busy, setBusy] = useState<"quote" | "sign" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MainnetTradeResult | null>(null);
  const [pendingExecution, setPendingExecution] =
    useState<PendingExecution | null>(null);
  const [now, setNow] = useState(Date.now());
  const requestVersion = useRef(0);
  const activeWallet = useRef(auth.walletAddress);
  activeWallet.current = auth.walletAddress;

  useEffect(() => {
    setInputToken(USDC);
    setOutputToken(issuerToken(asset));
    setAmount("");
  }, [asset.mint]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_EXECUTION_KEY);
      if (!raw) return;
      const pending = JSON.parse(raw) as Record<string, unknown>;
      if (
        typeof pending.walletAddress === "string" &&
        typeof pending.requestId === "string"
      )
        setPendingExecution({
          walletAddress: pending.walletAddress,
          requestId: pending.requestId,
        });
    } catch {
      /* Invalid browser storage does not authorize or retry a transaction. */
    }
  }, []);
  useEffect(() => {
    requestVersion.current += 1;
    setOrder(null);
    setError(null);
    setResult(null);
  }, [inputToken.mint, outputToken.mint, amount, auth.walletAddress]);
  useEffect(() => {
    if (!order) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [order]);

  async function requestQuote() {
    if (pendingExecution) return;
    setError(null);
    setResult(null);
    setOrder(null);
    const version = ++requestVersion.current;
    try {
      if (!auth.walletAddress)
        throw new Error("Sign in or connect your Solana wallet first.");
      // Mainnet mint accounts, not possibly stale search metadata, establish precision.
      if (
        !/^(0|[1-9]\d*)(\.\d+)?$/.test(amount.trim()) ||
        !/[1-9]/.test(amount)
      )
        throw new Error("Enter a positive decimal amount.");
      setBusy("quote");
      const response = await fetch("/api/trade/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          inputMint: inputToken.mint,
          outputMint: outputToken.mint,
          amount,
          taker: auth.walletAddress,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to fetch a live quote.");
      if (version === requestVersion.current) {
        setOrder(data);
        setNow(Date.now());
      }
    } catch (cause) {
      if (version === requestVersion.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to fetch a live quote.",
        );
    } finally {
      setBusy(null);
    }
  }

  async function approveTrade() {
    if (!order || busy || pendingExecution) return;
    setError(null);
    let executionAttempted = false;
    const attempt = { walletAddress: order.taker, requestId: order.requestId };
    try {
      if (!canApproveTrade(order, auth.walletAddress))
        throw new Error("This quote expired. Request a new quote.");
      setBusy("sign");
      // Opens the user's wallet confirmation; no server-held key can authorize a trade.
      const signedTransaction = await auth.signTransaction(order.transaction);
      if (!canApproveTrade(order, activeWallet.current))
        throw new Error(
          "The wallet changed or the quote expired. Request a new quote.",
        );
      setBusy("execute");
      // Retain only the attempt identity, never the signed transaction. Reloads cannot silently retry it.
      persistPendingExecution(attempt);
      executionAttempted = true;
      const response = await fetch("/api/trade/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedTransaction,
          authorization: order.authorization,
        }),
      });
      const data = classifyTradeExecution(await response.json());
      if (data.status === "Unknown") {
        setPendingExecution(attempt);
        return;
      }
      persistPendingExecution(null);
      if (data.status === "Failed") {
        setError(data.error || "The provider reported that the swap failed.");
        return;
      }
      setResult(data);
    } catch (cause) {
      if (executionAttempted) setPendingExecution(attempt);
      else
        setError(
          cause instanceof Error
            ? cause.message
            : "The transaction was not submitted.",
        );
    } finally {
      setOrder(null);
      setBusy(null);
    }
  }

  return (
    <section
      className={`actual-trade-panel ${className}`}
      aria-label={`Trade ${asset.symbol} on mainnet`}
    >
      <div className="notice">
        <strong>Actual trading</strong>
        <p>
          Swap your wallet’s tokens and market assets on Solana mainnet. Every
          trade requires your approval.
        </p>
      </div>
      {!auth.walletAddress && (
        <div className="trading-auth-actions">
          <button
            className="btn"
            onClick={auth.login}
            disabled={!auth.configured || !auth.ready}
          >
            Sign in with Privy
          </button>
          {!auth.configured && (
            <p className="fineprint">
              Privy sign-in is not configured for this deployment. Connect an
              existing wallet below.
            </p>
          )}
          <WalletButton />
        </div>
      )}
      {auth.walletAddress && (
        <p className="fineprint">
          Wallet {auth.walletAddress.slice(0, 6)}…{auth.walletAddress.slice(-4)}{" "}
          · Solana mainnet
        </p>
      )}
      <div className="segmented" role="group" aria-label="Trade direction">
        <button
          type="button"
          className={outputToken.mint === asset.mint ? "active" : ""}
          onClick={() => {
            setInputToken(USDC);
            setOutputToken(issuerToken(asset));
            setAmount("");
          }}
          disabled={Boolean(busy) || Boolean(pendingExecution)}
        >
          Buy {asset.symbol}
        </button>
        <button
          type="button"
          className={inputToken.mint === asset.mint ? "active" : ""}
          onClick={() => {
            setInputToken(issuerToken(asset));
            setOutputToken(USDC);
            setAmount("");
          }}
          disabled={Boolean(busy) || Boolean(pendingExecution)}
        >
          Sell {asset.symbol}
        </button>
      </div>
      <SwapTokenSelector
        label="You pay"
        token={inputToken}
        otherMint={outputToken.mint}
        disabled={Boolean(busy) || Boolean(pendingExecution)}
        onChange={setInputToken}
      />
      <button
        type="button"
        className={styles.reverse}
        disabled={Boolean(busy) || Boolean(pendingExecution)}
        onClick={() => {
          setInputToken(outputToken);
          setOutputToken(inputToken);
          setAmount("");
        }}
        aria-label="Reverse swap tokens"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M8 3v16m-4-4 4 4 4-4M16 21V5m-4 4 4-4 4 4" />
        </svg>
        Reverse
      </button>
      <SwapTokenSelector
        label="You receive"
        token={outputToken}
        otherMint={inputToken.mint}
        disabled={Boolean(busy) || Boolean(pendingExecution)}
        onChange={setOutputToken}
      />
      <label className="form-field">
        {inputToken.symbol} token units to spend
        <input
          inputMode="decimal"
          type="text"
          placeholder="0.00"
          value={amount}
          disabled={Boolean(busy) || Boolean(pendingExecution)}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      {!order && (
        <button
          className="btn"
          disabled={
            !auth.canSign ||
            !amount ||
            Boolean(busy) ||
            Boolean(pendingExecution)
          }
          onClick={() => void requestQuote()}
        >
          {busy === "quote" ? "Finding live route…" : "Review live quote"}
        </button>
      )}
      {order && (
        <div className="trade-summary">
          <dl>
            <div>
              <dt>You pay</dt>
              <dd>
                {fromTokenAmount(order.inAmount, order.inputDecimals)}{" "}
                {order.inputSymbol}
              </dd>
            </div>
            <div>
              <dt>Estimated received</dt>
              <dd>
                {fromTokenAmount(order.outAmount, order.outputDecimals)}{" "}
                {order.outputSymbol}
              </dd>
            </div>
            {order.otherAmountThreshold && (
              <div>
                <dt>Minimum received</dt>
                <dd>
                  {fromTokenAmount(
                    order.otherAmountThreshold,
                    order.outputDecimals,
                  )}{" "}
                  {order.outputSymbol}
                </dd>
              </div>
            )}
            <div>
              <dt>Slippage limit</dt>
              <dd>{(order.slippageBps / 100).toFixed(2)}%</dd>
            </div>
            <div>
              <dt>Swap fee</dt>
              <dd>{(order.feeBps / 100).toFixed(2)}%</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>{order.router}</dd>
            </div>
            <div>
              <dt>Quote validity</dt>
              <dd>
                {Math.max(0, Math.ceil((order.expiresAt - now) / 1_000))}s
              </dd>
            </div>
          </dl>
          <p className="fineprint">
            Network fees and token-account rent may also apply. Your wallet
            shows the final transaction before you approve.
          </p>
          <button
            className="btn"
            disabled={
              Boolean(busy) || !canApproveTrade(order, auth.walletAddress, now)
            }
            onClick={() => void approveTrade()}
          >
            {busy === "sign"
              ? "Approve in your wallet…"
              : busy === "execute"
                ? "Confirming on Solana…"
                : "Approve actual trade in wallet"}
          </button>
          {!busy && (
            <button
              className="btn secondary"
              onClick={() => void requestQuote()}
            >
              Refresh quote
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {pendingExecution && (
        <div className="stack" role="alert">
          <p className="notice">{UNKNOWN_TRADE_MESSAGE}</p>
          <a
            className="text-link"
            href={`https://solscan.io/account/${encodeURIComponent(pendingExecution.walletAddress)}`}
            target="_blank"
            rel="noreferrer"
          >
            Check wallet activity on Solscan
          </a>
          <button
            className="btn secondary"
            onClick={() => {
              persistPendingExecution(null);
              setPendingExecution(null);
            }}
          >
            I checked my wallet activity
          </button>
          <p className="fineprint">
            Kite will not retry the signed swap. This check remains required
            when you return to a trade screen in this tab.
          </p>
        </div>
      )}
      {result?.signature && (
        <p className="notice" role="status">
          Trade confirmed.{" "}
          <a
            href={`https://solscan.io/tx/${encodeURIComponent(result.signature)}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
          </a>
        </p>
      )}
      <p className="fineprint">
        Orders use raw token units. For xStocks, these can differ from your
        wallet’s adjusted balance after dividends or stock splits. Assets stay
        in your wallet.
      </p>
    </section>
  );
}
