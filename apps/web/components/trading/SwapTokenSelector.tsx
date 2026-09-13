"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  BASE_SWAP_TOKENS,
  holdingToSwapToken,
  type MainnetHolding,
  type SwapToken,
} from "@kite/sdk";
import styles from "./swap-tokens.module.css";

const units = (value: string) =>
  Number(value) > 0 && Number(value) < 0.00000001
    ? "<0.00000001"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(
        Number(value),
      );
const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

export function TokenAvatar({
  token,
}: {
  token: Pick<SwapToken, "mint" | "symbol" | "logoUrl">;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [token.logoUrl]);
  return (
    <span className={styles.monogram} aria-hidden="true">
      {token.logoUrl?.startsWith("https://") && !failed ? (
        <img
          src={token.logoUrl}
          width="40"
          height="40"
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        token.symbol.slice(0, 2)
      )}
    </span>
  );
}

export function SwapTokenSelector({
  label,
  token,
  otherMint,
  disabled,
  onChange,
  holdings = [],
  walletConnected = false,
  balancesLoading = false,
}: {
  label: string;
  token: SwapToken;
  otherMint: string;
  disabled: boolean;
  onChange: (token: SwapToken) => void;
  holdings?: MainnetHolding[];
  walletConnected?: boolean;
  balancesLoading?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"wallet" | "all">("wallet");
  const [query, setQuery] = useState("");
  const [tokens, setTokens] = useState<SwapToken[]>([...BASE_SWAP_TOKENS]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open || scope !== "all") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(
      async () => {
        try {
          const response = await fetch(
            `/api/tokens?${new URLSearchParams({ query })}`,
            { signal: controller.signal },
          );
          const data = await response.json();
          if (!response.ok || !Array.isArray(data.tokens))
            throw new Error(
              data.error || "Token search is temporarily unavailable.",
            );
          if (!controller.signal.aborted) {
            setTokens(data.tokens);
            setError(data.warning || null);
          }
        } catch (cause) {
          if (!controller.signal.aborted) {
            setTokens([]);
            setError(
              cause instanceof Error
                ? cause.message
                : "Token search is temporarily unavailable.",
            );
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      query ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, scope]);

  const owned = new Map(holdings.map((holding) => [holding.mint, holding]));
  const matches = (item: SwapToken) =>
    `${item.name} ${item.symbol} ${item.mint}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  const visible =
    scope === "wallet"
      ? holdings.map(holdingToSwapToken).filter(matches)
      : tokens;
  const selectedBalance = owned.get(token.mint);

  return (
    <div className={styles.selector}>
      <span className={styles.label}>{label}</span>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${token.symbol}`}
        onClick={() => {
          setScope(walletConnected ? "wallet" : "all");
          setOpen(!open);
        }}
      >
        <TokenAvatar token={token} />
        <span className={styles.identity}>
          <strong>{token.symbol}</strong>
          <small>{token.name}</small>
        </span>
        {selectedBalance && (
          <span className={styles.balance}>
            <strong>{units(selectedBalance.amount)}</strong>
            <small>In wallet</small>
          </span>
        )}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div className={styles.address}>
        <span>
          {token.source === "issuer"
            ? "Issuer asset"
            : token.verified
              ? "Verified token"
              : "Unverified token"}
        </span>
        <a
          href={`https://solscan.io/token/${token.mint}`}
          target="_blank"
          rel="noreferrer"
          title={token.mint}
        >
          {token.mint.slice(0, 5)}…{token.mint.slice(-4)}
        </a>
      </div>
      {open && (
        <div
          id={id}
          className={styles.picker}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className={styles.pickerHeading}>
            <strong>Select a token</strong>
            <button
              type="button"
              className={styles.close}
              onClick={close}
              aria-label="Close token selector"
            >
              Close
            </button>
          </div>
          <label className="form-field">
            <span className={styles.label}>Search tokens</span>
            <input
              autoFocus
              type="search"
              placeholder="Name or mint address"
              value={query}
              maxLength={100}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.tabs} role="group" aria-label="Token source">
            <button
              type="button"
              aria-pressed={scope === "wallet"}
              onClick={() => setScope("wallet")}
            >
              Your tokens <span>{holdings.length}</span>
            </button>
            <button
              type="button"
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              All tokens
            </button>
          </div>
          {scope === "all" && error && (
            <p className="fineprint" role="status">
              {error}
            </p>
          )}
          {(scope === "wallet"
            ? balancesLoading && holdings.length === 0
            : loading) && (
            <p className="fineprint" role="status">
              {scope === "wallet"
                ? "Reading wallet balances…"
                : "Searching mainnet tokens…"}
            </p>
          )}
          <div
            className={styles.results}
            aria-label={`${label} token results`}
            aria-busy={scope === "wallet" ? balancesLoading : loading}
          >
            {visible.length === 0 && !(scope === "all" && loading) && (
              <p className={styles.empty}>
                {scope === "wallet"
                  ? !walletConnected
                    ? "Connect a wallet to see your tokens."
                    : balancesLoading
                      ? "Your tokens will appear here."
                      : query
                        ? "No wallet token matches. Try All tokens."
                        : "No funded tokens in this wallet."
                  : "No matching token. Try its full mint address."}
              </p>
            )}
            {visible.map((item) => {
              const holding = owned.get(item.mint);
              const frozen = holding?.spendableAmount === "0";
              const unsupported =
                holding?.decimals !== undefined && holding.decimals > 18;
              return (
                <button
                  key={item.mint}
                  type="button"
                  className={styles.result}
                  disabled={
                    disabled ||
                    item.mint === otherMint ||
                    item.tradingHalted ||
                    frozen ||
                    unsupported ||
                    (scope === "all" && loading)
                  }
                  onClick={() => {
                    onChange(item);
                    close();
                  }}
                >
                  <TokenAvatar token={item} />
                  <span className={styles.identity}>
                    <strong>{item.symbol}</strong>
                    <small>{item.name}</small>
                    <small>
                      {item.mint.slice(0, 5)}…{item.mint.slice(-4)}
                      {!item.verified ? " · Unverified" : ""}
                    </small>
                  </span>
                  {holding ? (
                    <span className={styles.balance}>
                      <strong>{units(holding.amount)}</strong>
                      <small>
                        {item.tradingHalted
                          ? "Paused"
                          : frozen
                            ? "Frozen"
                            : unsupported
                              ? "Unsupported precision"
                              : holding.valueUsd === null
                                ? "Price unavailable"
                                : usd(holding.valueUsd)}
                      </small>
                    </span>
                  ) : (
                    <span className={styles.badge}>
                      {item.tradingHalted
                        ? "Paused"
                        : item.source === "issuer"
                          ? "Stock"
                          : item.verified
                            ? "Verified"
                            : "Unverified"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="fineprint">
            Balances are token units. A live route confirms what can be swapped.
          </p>
        </div>
      )}
    </div>
  );
}
