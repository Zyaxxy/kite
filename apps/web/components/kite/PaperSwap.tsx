"use client";

import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowRightLeft, Check, ChevronDown } from "lucide-react";
import {
  quotePaperSwap,
  type MarketAsset,
  type PaperAccount,
  type PaperSwapQuote,
} from "@kite/sdk";
import { money } from "./MarketUI";
import { TokenAvatar } from "../trading/SwapTokenSelector";
import { TradeTransfer } from "../trading/TradeTransfer";
import { NativeSelect } from "../ui/native-select";
import styles from "../trading/swap-tokens.module.css";

function decimal(value: number): string {
  const [coefficient, exponent] = value.toString().split("e");
  if (!exponent) return coefficient;
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + "0".repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

function Units({
  value,
  price,
}: {
  value: number | null;
  price: number | null;
}) {
  if (value === null || !Number.isFinite(value) || value < 0)
    return <span aria-label="Unavailable">--</span>;
  const raw = decimal(value);
  const precision =
    price && price > 0
      ? Math.max(0, Math.min(12, Math.ceil(Math.log10(price / 0.0001))))
      : 4;
  let display = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: precision,
  }).format(value);
  if (value > 0 && Number(value.toFixed(precision)) === 0)
    display = `<${decimal(10 ** -precision)}`;
  else if (/^0\.0{3,}[1-9]/.test(raw)) {
    const rounded = decimal(Number(value.toPrecision(4)));
    const match = rounded.match(/^0\.(0{3,})(\d+)/);
    if (match)
      display = `0.0${String(match[1].length).replace(/\d/g, (digit) => "₀₁₂₃₄₅₆₇₈₉"[Number(digit)])}${match[2]}`;
  }
  return (
    <span className="font-mono tabular-nums" aria-label={raw} title={raw}>
      {display}
    </span>
  );
}

const virtualValue = (value: number | null) =>
  value === null || !Number.isFinite(value)
    ? "--"
    : value > 0 && value < 0.01
      ? "<$0.01"
      : money(value);

export function PaperSwap({
  asset,
  assets,
  account,
  onSwap,
  disabled = false,
}: {
  asset: MarketAsset;
  assets: MarketAsset[];
  account: PaperAccount;
  onSwap: (
    inputAsset: MarketAsset,
    outputAsset: MarketAsset,
    inputQuantity: number,
  ) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [inputMint, setInputMint] = useState("");
  const [outputMint, setOutputMint] = useState(asset.mint);
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<PaperSwapQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    input: MarketAsset;
    output: MarketAsset;
    quote: PaperSwapQuote;
  } | null>(null);
  useEffect(() => {
    setInputMint("");
    setOutputMint(asset.mint);
    setAmount("");
    setSuccess(null);
  }, [asset.mint]);
  const held = assets.filter((item) =>
    account.positions.some(
      (position) => position.mint === item.mint && position.quantity > 0,
    ),
  );
  const input =
    held.find((item) => item.mint === inputMint) ??
    held.find((item) => item.mint !== asset.mint) ??
    held[0];
  const canPrice = (item: MarketAsset) =>
    item.verified &&
    !item.tradingHalted &&
    item.priceUsd !== null &&
    Number.isFinite(item.priceUsd) &&
    item.priceUsd > 0;
  const availableOutputs = assets.filter(
    (item) => item.mint !== input?.mint && canPrice(item),
  );
  const output =
    availableOutputs.find((item) => item.mint === outputMint) ??
    availableOutputs.find((item) => item.mint === asset.mint) ??
    availableOutputs[0];
  const holding = account.positions.find(
    (position) => position.mint === input?.mint,
  );
  const quantity = Number(amount);
  const estimatedValue =
    quantity > 0 && input?.priceUsd ? quantity * input.priceUsd : null;
  const estimatedOutput =
    estimatedValue !== null && output?.priceUsd
      ? estimatedValue / output.priceUsd
      : null;

  useEffect(() => {
    setReview(null);
    setError(null);
  }, [
    input?.mint,
    output?.mint,
    input?.priceUsd,
    output?.priceUsd,
    amount,
    account,
  ]);

  function submit() {
    setError(null);
    setSuccess(null);
    try {
      if (!input || !output)
        throw new Error("Choose two available market assets.");
      if (!review) {
        setReview(quotePaperSwap(account, input, output, quantity));
        return;
      }
      // A quote review is bound to its pair, input units and observed prices.
      if (
        review.inputMint !== input.mint ||
        review.outputMint !== output.mint ||
        review.inputQuantity !== quantity ||
        review.inputPriceUsd !== input.priceUsd ||
        review.outputPriceUsd !== output.priceUsd
      )
        throw new Error("Market prices changed. Review the paper swap again.");
      onSwap(input, output, quantity);
      setSuccess({ input, output, quote: review });
      setReview(null);
      setAmount("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to record the paper swap.",
      );
      setReview(null);
    }
  }

  return (
    <details className={styles.paperDetails}>
      <summary>
        <ArrowRightLeft size={16} aria-hidden="true" /> Swap paper assets{" "}
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className={styles.paperContent}>
        <p className="fineprint">
          Exchange a paper holding for another market asset using observed
          token-market prices.
        </p>
        {!input ? (
          <p className="notice">
            {account.positions.length
              ? "Refresh markets to load your paper holdings before swapping."
              : "Buy a paper asset first. Your holdings will appear here."}
          </p>
        ) : (
          <>
            <div className={styles.swapSide}>
              <label className={styles.label} htmlFor={`${id}-pay`}>
                You pay
              </label>
              <div className={styles.paperToken}>
                <TokenAvatar token={input} fetchMissing />
                <NativeSelect
                  id={`${id}-pay`}
                  value={input.mint}
                  disabled={disabled || Boolean(review)}
                  onChange={(event) => {
                    setInputMint(event.target.value);
                    setAmount("");
                    setSuccess(null);
                  }}
                >
                  {held.map((item) => (
                    <option
                      key={item.mint}
                      value={item.mint}
                      disabled={!canPrice(item)}
                    >
                      {item.symbol} · {item.name}
                      {!canPrice(item) ? " · Unavailable" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <label className={styles.amountField} htmlFor={`${id}-quantity`}>
                <span className={styles.label}>Paper units to swap</span>
                <input
                  id={`${id}-quantity`}
                  inputMode="decimal"
                  type="text"
                  placeholder="0.00"
                  value={amount}
                  readOnly={Boolean(review)}
                  disabled={disabled}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setSuccess(null);
                  }}
                />
              </label>
              <div className={styles.amountActions}>
                <span>
                  Available{" "}
                  <Units
                    value={holding?.quantity ?? null}
                    price={input.priceUsd}
                  />{" "}
                  {input.symbol}
                </span>
                {!review && (
                  <div>
                    <button
                      type="button"
                      disabled={disabled || !holding}
                      onClick={() => setAmount(decimal(holding?.quantity ?? 0))}
                    >
                      Max
                    </button>
                  </div>
                )}
              </div>
            </div>
            <span className={styles.paperArrow} aria-hidden="true">
              <ArrowDown size={17} />
            </span>
            <div className={styles.swapSide}>
              <label className={styles.label} htmlFor={`${id}-receive`}>
                You receive
              </label>
              <div className={styles.paperToken}>
                {output && <TokenAvatar token={output} fetchMissing />}
                <NativeSelect
                  id={`${id}-receive`}
                  value={output?.mint ?? ""}
                  disabled={disabled || Boolean(review)}
                  onChange={(event) => {
                    setOutputMint(event.target.value);
                    setSuccess(null);
                  }}
                >
                  {!output && (
                    <option value="">No priced market asset available</option>
                  )}
                  {availableOutputs.map((item) => (
                    <option key={item.mint} value={item.mint}>
                      {item.symbol} · {item.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className={styles.receiveAmount}>
                <Units
                  value={review?.outputQuantity ?? estimatedOutput}
                  price={output?.priceUsd ?? null}
                />
              </div>
              <p className="fineprint">
                Estimated paper units · observed token prices
              </p>
            </div>
            <div className="trade-summary" aria-live="polite">
              <div>
                <span>Paper units available</span>
                <span>
                  <Units
                    value={holding?.quantity ?? null}
                    price={input.priceUsd}
                  />
                </span>
              </div>
              <div>
                <span>Virtual swap value</span>
                <span className="font-mono tabular-nums">
                  {virtualValue(review?.valueUsd ?? estimatedValue)}
                </span>
              </div>
              <div>
                <span>
                  {review ? "Paper units to receive" : "Estimated paper units"}
                </span>
                <span>
                  <Units
                    value={review?.outputQuantity ?? estimatedOutput}
                    price={output?.priceUsd ?? null}
                  />{" "}
                  {output?.symbol}
                </span>
              </div>
              <div>
                <span>Paper cash after swap</span>
                <span className="font-mono tabular-nums">
                  {virtualValue(account.cashUsd)}
                </span>
              </div>
            </div>
            <button
              className="btn full"
              type="button"
              disabled={
                disabled ||
                !output ||
                !canPrice(input) ||
                !(quantity > 0) ||
                !Number.isFinite(quantity)
              }
              onClick={submit}
            >
              {review ? (
                <>
                  <Check size={15} />
                  Confirm paper swap
                </>
              ) : (
                <>
                  <ArrowRightLeft size={15} />
                  Review paper swap
                </>
              )}
            </button>
            {review && (
              <button
                className="btn ghost full"
                type="button"
                onClick={() => setReview(null)}
              >
                Edit swap
              </button>
            )}
          </>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <TradeTransfer
            phase="success"
            input={success.input}
            output={success.output}
            inputAmount={decimal(success.quote.inputQuantity)}
            outputAmount={decimal(success.quote.outputQuantity)}
            paper
          />
        )}
        <p className="fineprint">
          This records a simulated sale and purchase together. No fees or
          slippage are simulated, and no real tokens move.
        </p>
      </div>
    </details>
  );
}
