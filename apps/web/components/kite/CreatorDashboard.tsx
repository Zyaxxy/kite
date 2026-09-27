"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Copy, Plus } from "lucide-react";
import {
  fromTokenAmount,
  type CreatorStats,
  type PublishedCreatorBasket,
} from "@kite/sdk";
import { useTradingAuth } from "../trading/TradingAuth";
import { WalletButton } from "../trading/WalletButton";
import styles from "./Creator.module.css";

export function CreatorDashboard() {
  const auth = useTradingAuth();
  const [stats, setStats] = useState<CreatorStats | null>(null),
    [baskets, setBaskets] = useState<PublishedCreatorBasket[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    const wallet = auth.walletAddress,
      controller = new AbortController();
    setStats(null);
    setBaskets([]);
    setError("");
    if (!wallet) return;
    setLoading(true);
    void Promise.all([
      fetch(`/api/creators/stats?wallet=${wallet}`, {
        signal: controller.signal,
      }),
      fetch(`/api/creators/baskets?wallet=${wallet}`, {
        signal: controller.signal,
      }),
    ])
      .then(async ([activity, collection]) => {
        const [metrics, items] = await Promise.all([
          activity.json(),
          collection.json(),
        ]);
        if (!activity.ok || !collection.ok)
          throw new Error(
            metrics.error ??
              items.error ??
              "Creator activity is temporarily unavailable.",
          );
        if (!controller.signal.aborted) {
          setStats(metrics as CreatorStats);
          setBaskets(items.baskets);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not load creator activity.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [auth.walletAddress, revision]);
  async function copyBlink(id: string) {
    try {
      const action = `${window.location.origin}/api/actions/baskets/${id}`;
      await navigator.clipboard.writeText(
        `https://dial.to/?action=solana-action:${encodeURIComponent(action)}`,
      );
      setMessage(
        "Subscription Blink copied. This opens the devnet subscription flow in compatible clients.",
      );
    } catch {
      setMessage(
        "Clipboard access is unavailable. Open the basket to copy its link.",
      );
    }
  }
  return (
    <div className={styles.studio}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">Creator studio</p>
          <h1>Build an idea people return to.</h1>
          <p>
            Your published baskets, recurring community and confirmed routed
            volume.
          </p>
        </div>
        <Link className="btn" href="/basket/builder">
          <Plus size={16} aria-hidden="true" />
          Create a basket
        </Link>
      </div>
      {!auth.walletAddress ? (
        <section className={styles.editor}>
          <h2>Your creator activity lives with your wallet.</h2>
          <p className="fineprint">
            Connect the wallet used to publish. An invite is required to
            publish; private drafts are open to everyone.
          </p>
          <WalletButton />
          {auth.privyConfigured && (
            <button className="text-link" onClick={auth.login}>
              Sign in with Privy
            </button>
          )}
        </section>
      ) : (
        <>
          <div className={styles.metrics} aria-busy={loading}>
            <div>
              <small>Creator points</small>
              <strong>{stats ? stats.points : "—"}</strong>
              <p>100 per active mainnet subscriber. 1 per $100 routed.</p>
            </div>
            <div>
              <small>Confirmed USDC volume</small>
              <strong>
                {stats
                  ? `$${Number(fromTokenAmount(stats.volumeUsdcBaseUnits, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : "—"}
              </strong>
              <p>Mainnet receipts only. Self-purchases are excluded.</p>
            </div>
            <div>
              <small>Active mainnet subscribers</small>
              <strong>{stats ? stats.activeSubscribers : "—"}</strong>
              <p>Mainnet recurring is not enabled in this release.</p>
            </div>
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button type="button" onClick={() => setRevision((v) => v + 1)}>
                Retry
              </button>
            </div>
          )}
          {stats && (
            <p className="notice">
              Devnet preview: {stats.devnet.activeSubscribers} active
              subscribers. Test-token activity earns no production points.
            </p>
          )}
          <div className="section-head">
            <h2>Your published collection</h2>
            <button
              type="button"
              className="text-link"
              onClick={() => setRevision((v) => v + 1)}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh activity"}
            </button>
          </div>
          {baskets.length ? (
            baskets.map((basket) => (
              <article className={styles.published} key={basket.id}>
                <div>
                  <h3>{basket.name}</h3>
                  <p>
                    {basket.allocations.length} assets · {basket.ticker}
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => void copyBlink(basket.id)}
                  >
                    <Copy size={15} aria-hidden="true" />
                    Copy subscription Blink
                  </button>
                  <Link
                    className="btn secondary small"
                    href={`/basket/${basket.id}`}
                  >
                    Open basket <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))
          ) : !error ? (
            <div className={styles.empty}>
              <h3>
                {loading
                  ? "Loading your collection…"
                  : "Your first idea starts here."}
              </h3>
              <p>
                Save a private draft, then publish with your creator invitation.
              </p>
            </div>
          ) : null}
          <p role="status" className="fineprint">
            {message}
          </p>
          <p className="fineprint">
            Points are engagement measurements, with no promised cash or token
            value. Subscription Blinks currently prepare devnet test-token
            transactions.
          </p>
        </>
      )}
    </div>
  );
}
