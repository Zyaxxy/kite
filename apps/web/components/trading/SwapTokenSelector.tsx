"use client";

import { useEffect, useId, useState } from "react";
import { BASE_SWAP_TOKENS, type SwapToken } from "@kite/sdk";
import styles from "./swap-tokens.module.css";

export function SwapTokenSelector({
  label,
  token,
  otherMint,
  disabled,
  onChange,
}: {
  label: string;
  token: SwapToken;
  otherMint: string;
  disabled: boolean;
  onChange: (token: SwapToken) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tokens, setTokens] = useState<SwapToken[]>([...BASE_SWAP_TOKENS]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
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
          setTokens(data.tokens);
          setError(data.warning || null);
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
      query ? 300 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  return (
    <div className={styles.selector}>
      <span className={styles.label}>{label}</span>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${token.symbol}`}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.monogram} aria-hidden="true">
          {token.symbol.slice(0, 2)}
        </span>
        <span className={styles.identity}>
          <strong>{token.symbol}</strong>
          <small>{token.name}</small>
        </span>
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
        <div id={id} className={styles.picker}>
          <label className="form-field">
            Find a token
            <input
              autoFocus
              type="search"
              placeholder="Name, symbol or mint address"
              value={query}
              maxLength={100}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {error && (
            <p className="fineprint" role="status">
              {error}
            </p>
          )}
          {loading && (
            <p className="fineprint" role="status">
              Searching mainnet tokens…
            </p>
          )}
          <div
            className={styles.results}
            aria-label={`${label} token results`}
            aria-busy={loading}
          >
            {!loading && tokens.length === 0 && (
              <p className="fineprint">
                No matching token. Try its full mint address.
              </p>
            )}
            {tokens.map((item) => (
              <button
                key={item.mint}
                type="button"
                className={styles.result}
                disabled={
                  loading ||
                  disabled ||
                  item.mint === otherMint ||
                  item.tradingHalted
                }
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className={styles.identity}>
                  <strong>{item.symbol}</strong>
                  <small>{item.name}</small>
                  <small>
                    {item.mint.slice(0, 5)}…{item.mint.slice(-4)}
                  </small>
                </span>
                <span className={styles.badge}>
                  {item.tradingHalted
                    ? "Paused"
                    : item.source === "issuer"
                      ? "Stock"
                      : item.verified
                        ? "Verified"
                        : "Unverified"}
                </span>
              </button>
            ))}
          </div>
          <p className="fineprint">
            Choose by mint address. A live route and sufficient wallet balance
            are required.
          </p>
          <button
            type="button"
            className="text-link"
            onClick={() => setOpen(false)}
          >
            Close token search
          </button>
        </div>
      )}
    </div>
  );
}
