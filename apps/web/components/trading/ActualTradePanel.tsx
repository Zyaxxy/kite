"use client";

import { useEffect, useRef, useState } from "react";
import {
  fromTokenAmount,
  BASE_SWAP_TOKENS,
  MAINNET_USDC_MINT,
  MAINNET_SOL_MINT,
  toTokenAmount,
  holdingToSwapToken,
  maxSwapAmount,
  canApproveTrade,
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
import { useWalletPortfolio } from "./useWalletPortfolio";
import { kiteClient } from "../kite/api-client";

const USDC = BASE_SWAP_TOKENS.find(
  (token) => token.mint === MAINNET_USDC_MINT,
)!;
const issuerToken = (asset: TradableAsset & Partial<SwapToken>): SwapToken => ({
  ...asset,
  source: asset.source ?? "issuer",
  verified: asset.verified ?? true,
  logoUrl: asset.logoUrl ?? null,
  priceUsd: asset.priceUsd ?? null,
  tradingHalted: asset.tradingHalted ?? false,
});

const PENDING_EXECUTION_KEY = "kite:pending-mainnet-execution";
interface PendingExecution {
  walletAddress: string;
  requestId: string;
}

function persistPendingExecution(pending: PendingExecution | null) {
  try {
    if (pending)
      localStorage.setItem(PENDING_EXECUTION_KEY, JSON.stringify(pending));
    else {
      localStorage.removeItem(PENDING_EXECUTION_KEY);
      sessionStorage.removeItem(PENDING_EXECUTION_KEY);
    }
    window.dispatchEvent(new Event(PENDING_EXECUTION_KEY));
    return true;
  } catch {
    return false;
  }
}

export function ActualTradePanel({
  asset,
  className = "",
  initialSide = "buy",
}: {
  asset: TradableAsset & Partial<SwapToken>;
  className?: string;
  initialSide?: "buy" | "sell";
}) {
  const auth = useTradingAuth();
  const counterToken =
    asset.mint === MAINNET_USDC_MINT ? BASE_SWAP_TOKENS[0] : USDC;
  const {
    portfolio,
    loading: balancesLoading,
    error: balancesError,
    refresh: refreshBalances,
  } = useWalletPortfolio(auth.walletAddress);
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
  const [pendingStorageError, setPendingStorageError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const requestVersion = useRef(0);
  const activeWallet = useRef(auth.walletAddress);
  const automaticInput = useRef<string | null>(null);
  activeWallet.current = auth.walletAddress;
  const inputHolding = portfolio?.holdings.find(
    (holding) => holding.mint === inputToken.mint,
  );
  const maxAmount = maxSwapAmount(inputHolding);
  let balanceError: string | null = null;
  if (portfolio && amount && inputToken.decimals !== null) {
    try {
      const requested = BigInt(toTokenAmount(amount, inputToken.decimals));
      const available =
        maxAmount === "0"
          ? BigInt(0)
          : BigInt(toTokenAmount(maxAmount, inputToken.decimals));
      if (requested > available)
        balanceError =
          inputToken.mint === MAINNET_SOL_MINT
            ? "Keep 0.01 SOL available for network fees and account rent."
            : "This amount exceeds your available token balance.";
    } catch (cause) {
      balanceError =
        cause instanceof Error ? cause.message : "Check the token amount.";
    }
  }

  useEffect(() => {
    setInputToken(initialSide === "sell" ? issuerToken(asset) : counterToken);
    setOutputToken(initialSide === "sell" ? counterToken : issuerToken(asset));
    setAmount("");
    automaticInput.current = null;
  }, [asset.mint, initialSide]);
  useEffect(() => {
    if (
      !portfolio ||
      initialSide === "sell" ||
      automaticInput.current === portfolio.walletAddress ||
      amount ||
      busy
    )
      return;
    automaticInput.current = portfolio.walletAddress;
    const spendable = portfolio.holdings.filter(
      (holding) =>
        holding.mint !== outputToken.mint && maxSwapAmount(holding) !== "0",
    );
    const preferred =
      spendable.find((holding) => holding.mint === MAINNET_USDC_MINT) ??
      spendable[0];
    if (preferred) setInputToken(holdingToSwapToken(preferred));
  }, [portfolio, initialSide, outputToken.mint, amount, busy]);
  useEffect(() => {
    const readPending = () => {
      try {
        const raw =
          localStorage.getItem(PENDING_EXECUTION_KEY) ??
          sessionStorage.getItem(PENDING_EXECUTION_KEY);
        if (!raw) {
          setPendingExecution(null);
          setPendingStorageError(false);
          return;
        }
        const pending = JSON.parse(raw) as Record<string, unknown>;
        if (
          typeof pending.walletAddress !== "string" ||
          typeof pending.requestId !== "string"
        )
          throw new Error("Unreadable pending execution");
        setPendingExecution({
          walletAddress: pending.walletAddress,
          requestId: pending.requestId,
        });
        setPendingStorageError(false);
      } catch {
        setPendingStorageError(true);
      }
    };
    readPending();
    window.addEventListener("storage", readPending);
    window.addEventListener(PENDING_EXECUTION_KEY, readPending);
    return () => {
      window.removeEventListener("storage", readPending);
      window.removeEventListener(PENDING_EXECUTION_KEY, readPending);
    };
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
    if (pendingExecution || pendingStorageError || busy) return;
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
      // Recheck funds immediately before the quote; old observations only support display.
      const current = await kiteClient.getPortfolio(auth.walletAddress);
      if (
        version !== requestVersion.current ||
        current.walletAddress !== activeWallet.current
      )
        return;
      const holding = current.holdings.find(
        (item) => item.mint === inputToken.mint,
      );
      if (holding?.decimals === undefined)
        throw new Error("This token has no verified balance in your wallet.");
      const available = maxSwapAmount(holding);
      if (
        available === "0" ||
        BigInt(toTokenAmount(amount, holding.decimals)) >
          BigInt(toTokenAmount(available, holding.decimals))
      )
        throw new Error(
          inputToken.mint === MAINNET_SOL_MINT
            ? "Your available SOL changed. Keep 0.01 SOL for fees and account rent."
            : "This amount exceeds your current available token balance.",
        );
      const data = await kiteClient.requestTradeOrder({
        inputMint: inputToken.mint,
        outputMint: outputToken.mint,
        amount,
        taker: auth.walletAddress,
      });
      if (
        version === requestVersion.current &&
        data.taker === activeWallet.current
      ) {
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
    if (!order || busy || pendingExecution || pendingStorageError) return;
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
      if (!persistPendingExecution(attempt))
        throw new Error(
          "Kite could not save this swap’s pending state. Nothing was submitted. Enable browser storage before trying again.",
        );
      executionAttempted = true;
      const data = await kiteClient.executeTrade({
        signedTransaction,
        authorization: order.authorization,
      });
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
      refreshBalances();
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
      <div className={styles.swapHeading}>
        <div>
          <p className="eyebrow">SOLANA MAINNET</p>
          <h3>Swap</h3>
        </div>
        {auth.walletAddress && (
          <button
            type="button"
            className={styles.close}
            disabled={balancesLoading || Boolean(busy)}
            onClick={refreshBalances}
          >
            {balancesLoading ? "Refreshing…" : "Refresh balances"}
          </button>
        )}
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
      {balancesError && (
        <p className="notice error" role="alert">
          {balancesError}
        </p>
      )}
      {portfolio?.warnings?.map((warning) => (
        <p className="fineprint" key={warning}>
          {warning}
        </p>
      ))}
      <div className="segmented" role="group" aria-label="Trade direction">
        <button
          type="button"
          className={outputToken.mint === asset.mint ? "active" : ""}
          onClick={() => {
            setInputToken(counterToken);
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
            setOutputToken(counterToken);
            setAmount("");
          }}
          disabled={Boolean(busy) || Boolean(pendingExecution)}
        >
          Sell {asset.symbol}
        </button>
      </div>
      <div className={styles.swapSide}>
        <SwapTokenSelector
          label="You pay"
          token={inputToken}
          otherMint={outputToken.mint}
          disabled={Boolean(busy) || Boolean(pendingExecution)}
          holdings={portfolio?.holdings}
          walletConnected={Boolean(auth.walletAddress)}
          balancesLoading={balancesLoading}
          onChange={(token) => {
            setInputToken(token);
            setAmount("");
            automaticInput.current = auth.walletAddress;
          }}
        />
        <label className={styles.amountField}>
          <span className={styles.label}>Amount to pay</span>
          <input
            inputMode="decimal"
            type="text"
            placeholder="0.00"
            value={amount}
            maxLength={40}
            aria-invalid={Boolean(balanceError)}
            disabled={Boolean(busy) || Boolean(pendingExecution)}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <div className={styles.amountActions}>
          <span>
            {inputHolding
              ? `Available ${maxAmount} ${inputToken.symbol}`
              : balancesLoading
                ? "Reading wallet…"
                : auth.walletAddress
                  ? "No available balance"
                  : "Connect your wallet"}
          </span>
          <div>
            <button
              type="button"
              disabled={
                maxAmount === "0" || Boolean(busy) || Boolean(pendingExecution)
              }
              onClick={() => {
                if (inputHolding?.decimals !== undefined)
                  setAmount(
                    fromTokenAmount(
                      (
                        BigInt(
                          toTokenAmount(maxAmount, inputHolding.decimals),
                        ) / BigInt(2)
                      ).toString(),
                      inputHolding.decimals,
                    ),
                  );
              }}
            >
              Half
            </button>
            <button
              type="button"
              disabled={
                maxAmount === "0" || Boolean(busy) || Boolean(pendingExecution)
              }
              onClick={() => setAmount(maxAmount)}
            >
              Max
            </button>
          </div>
        </div>
        {inputToken.mint === MAINNET_SOL_MINT && (
          <p className="fineprint">
            Max keeps 0.01 SOL for fees and account rent. The live route
            confirms the actual cost.
          </p>
        )}
      </div>
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
      <div className={styles.swapSide}>
        <SwapTokenSelector
          label="You receive"
          token={outputToken}
          otherMint={inputToken.mint}
          disabled={Boolean(busy) || Boolean(pendingExecution)}
          onChange={setOutputToken}
          holdings={portfolio?.holdings}
          walletConnected={Boolean(auth.walletAddress)}
          balancesLoading={balancesLoading}
        />
        <div className={styles.receiveAmount}>
          {order ? fromTokenAmount(order.outAmount, order.outputDecimals) : "—"}
        </div>
        <p className="fineprint">Estimated received after a live quote</p>
      </div>
      {balanceError && (
        <p className="notice error" role="alert">
          {balanceError}
        </p>
      )}
      {!order && (
        <button
          className="btn"
          disabled={
            !auth.canSign ||
            !amount ||
            !portfolio ||
            Boolean(balancesError) ||
            Boolean(balanceError) ||
            Boolean(busy) ||
            Boolean(pendingExecution) ||
            pendingStorageError
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
            {order.simulation?.status === "passed"
              ? "Mainnet preflight passed. "
              : ""}
            Network fees and token-account rent may also apply. Your wallet
            shows the final transaction before you approve.
          </p>
          <button
            className="btn"
            disabled={
              Boolean(busy) ||
              Boolean(pendingExecution) ||
              pendingStorageError ||
              !canApproveTrade(order, auth.walletAddress, now)
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
      {pendingStorageError && (
        <p className="notice error" role="alert">
          This browser could not read the previous swap state. Check wallet
          activity and browser storage before placing another actual trade.
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
            when you return to a trade screen in this browser.
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
