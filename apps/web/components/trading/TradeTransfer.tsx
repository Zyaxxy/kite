"use client";

/**
 * Currency Transfer adapted from Kokonut UI by @dorianbaffier (MIT).
 * https://kokonutui.com/docs/components/currency-transfer
 * The supplied visual now follows transaction state; there is no completion timer.
 */
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CircleAlert,
  ExternalLink,
} from "lucide-react";
import type { SwapToken } from "@kite/sdk";
import { TokenAvatar } from "./SwapTokenSelector";
import styles from "./swap-tokens.module.css";

type TransferToken = Pick<SwapToken, "mint" | "symbol" | "logoUrl">;
const transferAmount = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 8,
  notation: "standard",
});

function displayAmount(value: string): string {
  const number = Number(value);
  // Keep the exact value if it exceeds Number's range; never turn a tiny amount into zero.
  if (!Number.isFinite(number) || (number === 0 && /[1-9]/.test(value)))
    return value;
  return transferAmount.format(number);
}

export type TransferPhase =
  "review" | "signing" | "confirming" | "success" | "unknown" | "error";

export function TradeTransfer({
  phase,
  input,
  output,
  inputAmount,
  outputAmount,
  paper = false,
  signature,
  estimatedOutput,
}: {
  phase: TransferPhase;
  input: TransferToken;
  output: TransferToken;
  inputAmount: string;
  outputAmount: string;
  paper?: boolean;
  signature?: string;
  estimatedOutput?: boolean;
}) {
  const moving = phase === "signing" || phase === "confirming";
  const labels: Record<TransferPhase, [string, string]> = {
    review: ["Ready to review", "Check the amounts before you confirm."],
    signing: [
      "Approve in your wallet",
      "Your signature is needed to continue.",
    ],
    confirming: ["Swap in progress", "Waiting for confirmation on Solana."],
    success: paper
      ? ["Paper swap recorded", "Your simulated holdings have been updated."]
      : ["Swap confirmed", "Your transaction is confirmed on Solana."],
    unknown: [
      "Check your wallet activity",
      "Confirmation is unknown. Do not submit again.",
    ],
    error: [
      "Swap not completed",
      "Review the message below before trying again.",
    ],
  };
  const [title, description] = labels[phase];
  return (
    <div
      className={styles.transfer}
      data-phase={phase}
      role="status"
      aria-live="polite"
      aria-busy={moving}
    >
      <div className={styles.transferSymbol} aria-hidden="true">
        {moving && <span className={styles.transferOrbit} />}
        <span className={styles.transferCore} key={phase}>
          {phase === "success" ? (
            <Check size={27} strokeWidth={2.6} />
          ) : phase === "error" || phase === "unknown" ? (
            <CircleAlert size={27} />
          ) : (
            <ArrowUpDown size={25} />
          )}
        </span>
      </div>
      <div className={styles.transferHeading}>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className={styles.transferPair}>
        <div>
          <span className={styles.transferDirection}>
            <ArrowUp size={12} /> From
          </span>
          <TokenAvatar token={input} fetchMissing />
          <strong title={inputAmount}>
            <span className={styles.transferAmount} aria-label={inputAmount}>
              {displayAmount(inputAmount)}
            </span>
            <small>{input.symbol}</small>
          </strong>
        </div>
        <ArrowUpDown
          className={styles.transferBetween}
          size={16}
          aria-hidden="true"
        />
        <div>
          <span className={styles.transferDirection}>
            <ArrowDown size={12} /> To
            {(estimatedOutput ?? phase !== "success") ? " · est." : ""}
          </span>
          <TokenAvatar token={output} fetchMissing />
          <strong title={outputAmount}>
            <span className={styles.transferAmount} aria-label={outputAmount}>
              {displayAmount(outputAmount)}
            </span>
            <small>{output.symbol}</small>
          </strong>
        </div>
      </div>
      {signature && (
        <a
          className={styles.transferLink}
          href={`https://solscan.io/tx/${encodeURIComponent(signature)}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction <ExternalLink size={12} />
        </a>
      )}
      {paper && (
        <span className={styles.transferNote}>
          Paper account · no real tokens move
        </span>
      )}
    </div>
  );
}
