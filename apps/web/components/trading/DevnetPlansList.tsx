"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Repeat2,
  ExternalLink,
  Pause,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  CircleHelp,
  Plus,
  Loader2,
  Layers,
} from "lucide-react";
import { useTradingAuth } from "./TradingAuth";

interface DevnetOutput {
  mint: string;
  weightBps: number;
  pool: string;
  minimumAmountOut: string;
}

interface DevnetPlan {
  address: string;
  version: number;
  devnetMock: boolean;
  owner: string;
  fundingMint: string;
  nonce: string;
  fundingAmount: string;
  periodSeconds: number;
  startsAt: number;
  expiresAt: number;
  periods: number;
  executedPeriods: number;
  lastExecutedPeriod: number;
  lastExecutedAt: number;
  subscriptionAuthority: string;
  recurringDelegation: string;
  subscriptionInitId: string;
  bump: number;
  outputs: DevnetOutput[];
  duePeriodIndex: number | null;
}

interface DevnetAssetConfig {
  id: string;
  mint: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  decimals: number;
  logo?: string;
}

interface DevnetBasketConfig {
  id: string;
  name: string;
  ticker: string;
  underlyingSymbols: string[];
}

interface DevnetConfig {
  assets: DevnetAssetConfig[];
  baskets: DevnetBasketConfig[];
  fundingToken: {
    mint: string;
    symbol: string;
    decimals: number;
  };
}

interface DevnetPlansListProps {
  refreshTrigger?: number;
  onPlanRevoked?: () => void;
}

const formatDate = (timestampSeconds: number) => {
  if (!timestampSeconds) return "—";
  return new Date(timestampSeconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatPeriod = (seconds: number) => {
  if (seconds === 60) return "Every 60s · Devnet test";
  if (seconds === 300) return "Every 5 min · Devnet test";
  if (seconds === 3600) return "Every hour · Devnet test";
  if (seconds === 86400) return "Daily";
  if (seconds === 604800) return "Weekly";
  if (seconds === 1209600) return "Bi-weekly";
  if (seconds === 2592000) return "Monthly";
  return `Every ${seconds}s`;
};

const shorten = (addr: string) => `${addr.slice(0, 4)}…${addr.slice(-4)}`;

export function DevnetPlansList({
  refreshTrigger = 0,
  onPlanRevoked,
}: DevnetPlansListProps) {
  const auth = useTradingAuth();
  const [plans, setPlans] = useState<DevnetPlan[]>([]);
  const [config, setConfig] = useState<DevnetConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevokePlan, setConfirmRevokePlan] = useState<string | null>(null);
  const [revokingPlan, setRevokingPlan] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionExplorerUrl, setActionExplorerUrl] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Load devnet token catalog/config
  useEffect(() => {
    fetch("/api/recurring/config")
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.assets)) {
          setConfig(data);
        }
      })
      .catch(() => {
        /* non-fatal, fallback to raw mint display */
      });
  }, []);

  const fetchPlans = useCallback(async () => {
    if (!auth.walletAddress) {
      setPlans([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/recurring?wallet=${auth.walletAddress}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to load devnet recurring plans.");
      }
      setPlans(Array.isArray(data.plans) ? data.plans : []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch recurring plans.");
    } finally {
      setLoading(false);
    }
  }, [auth.walletAddress]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans, refreshTrigger]);

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleRevoke = async (planAddress: string) => {
    if (!auth.walletAddress) return;
    setRevokingPlan(planAddress);
    setActionError(null);
    setActionSuccess(null);
    setActionExplorerUrl(null);

    try {
      // 1. Prepare on-chain revocation transaction
      const res = await fetch("/api/recurring/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          plan: planAddress,
          owner: auth.walletAddress,
          supportedTransactionVersions: [1],
        }),
      });
      const order = await res.json();
      if (!res.ok) {
        throw new Error(order.error || "Unable to prepare plan revocation.");
      }

      // 2. Request wallet signature
      const signedTransaction = await auth.signTransaction(
        order.transaction,
        1,
        "solana:devnet",
      );

      // 3. Submit and execute on-chain
      const execRes = await fetch("/api/recurring/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          authorization: order.authorization,
          signedTransaction,
        }),
      });
      const execResult = await execRes.json();
      if (!execRes.ok || execResult.status === "failed") {
        throw new Error(
          execResult.error || "The devnet revocation transaction failed on-chain.",
        );
      }

      setActionSuccess(
        "Recurring plan revoked! Subscription delegation cancelled and account rent reclaimed to your wallet.",
      );
      if (execResult.explorerUrl) {
        setActionExplorerUrl(execResult.explorerUrl);
      }
      setConfirmRevokePlan(null);

      // Refresh list
      await fetchPlans();
      if (onPlanRevoked) onPlanRevoked();
    } catch (err: any) {
      setActionError(err.message || "Failed to revoke recurring plan.");
    } finally {
      setRevokingPlan(null);
    }
  };

  // Helper to identify what the plan invests in
  const resolveTarget = (plan: DevnetPlan) => {
    if (!config) {
      return {
        name: `Plan ${shorten(plan.address)}`,
        symbol: "DEVNET",
        logo: null,
        isBasket: plan.outputs.length > 1,
        constituents: [],
      };
    }

    // Single stock
    if (plan.outputs.length === 1) {
      const asset = config.assets.find((a) => a.mint === plan.outputs[0].mint);
      if (asset) {
        return {
          name: asset.name,
          symbol: asset.symbol,
          logo: asset.logo || null,
          isBasket: false,
          constituents: [asset.symbol],
        };
      }
    }

    // Multi-asset basket: try to match basket
    if (plan.outputs.length > 1) {
      const outputMints = new Set(plan.outputs.map((o) => o.mint));
      const basket = config.baskets.find((b) => {
        const basketAssets = config.assets.filter((a) =>
          b.underlyingSymbols.includes(a.underlyingSymbol),
        );
        return (
          basketAssets.length === plan.outputs.length &&
          basketAssets.every((a) => outputMints.has(a.mint))
        );
      });

      if (basket) {
        return {
          name: basket.name,
          symbol: basket.ticker,
          logo: null,
          isBasket: true,
          constituents: basket.underlyingSymbols,
        };
      }

      // Generic multi-asset basket
      const symbols = plan.outputs
        .map((o) => config.assets.find((a) => a.mint === o.mint)?.symbol || shorten(o.mint))
        .filter(Boolean);

      return {
        name: "Curated Thematic Basket",
        symbol: `${plan.outputs.length} Assets`,
        logo: null,
        isBasket: true,
        constituents: symbols,
      };
    }

    return {
      name: "Devnet Investment",
      symbol: "TEST",
      logo: null,
      isBasket: false,
      constituents: [],
    };
  };

  if (!auth.walletAddress) {
    return (
      <div className="panel" style={{ padding: 24, textAlign: "center" }}>
        <p className="fineprint" style={{ margin: 0 }}>
          Connect your Solana wallet to view and manage your active devnet recurring plans.
        </p>
      </div>
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const activePlans = plans.filter(
    (p) => p.executedPeriods < p.periods && nowSeconds <= p.expiresAt,
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="flex-between" style={{ alignItems: "center" }}>
        <div className="flex-start" style={{ gap: 10, alignItems: "center" }}>
          <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Your devnet recurring plans</h2>
          <span className={`badge ${activePlans.length > 0 ? "lime" : ""}`}>
            {activePlans.length} ACTIVE
          </span>
        </div>
        <button
          type="button"
          className="btn ghost small"
          onClick={fetchPlans}
          disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={13} className={loading ? "spin" : ""} />
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {actionSuccess && (
        <div
          className="notice"
          style={{
            borderColor: "var(--color-emerald-500, #10b981)",
            backgroundColor: "rgba(16, 185, 129, 0.08)",
          }}
        >
          <CheckCircle2 size={16} style={{ color: "#10b981" }} />
          <div>
            <p style={{ margin: 0, fontWeight: 500 }}>{actionSuccess}</p>
            {actionExplorerUrl && (
              <a
                href={actionExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-link"
                style={{
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                View closing transaction on Solana Explorer <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      )}

      {actionError && (
        <div className="notice error">
          <AlertCircle size={16} />
          <div>
            <p style={{ margin: 0 }}>{actionError}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="notice error">
          <AlertCircle size={16} />
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      {plans.length === 0 && !loading && (
        <div className="panel" style={{ padding: 24 }}>
          <div className="flex-between" style={{ alignItems: "center", flexWrap: "wrap", gap: 14 }}>
            <div>
              <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>No devnet plans yet</h3>
              <p className="fineprint" style={{ margin: 0 }}>
                You don’t have any active recurring plans on Solana devnet. Use the builder below to start your first plan.
              </p>
            </div>
            <a href="#new-plan" className="btn secondary small">
              <Plus size={13} /> Start a plan
            </a>
          </div>
        </div>
      )}

      {plans.map((plan) => {
        const target = resolveTarget(plan);
        const amountKusd = Number(plan.fundingAmount) / 1e6;
        const totalLimitKusd = amountKusd * plan.periods;
        const isExpired = nowSeconds > plan.expiresAt;
        const isCompleted = plan.executedPeriods >= plan.periods;
        const isDue = plan.duePeriodIndex !== null;
        const isRevoking = revokingPlan === plan.address;
        const isConfirming = confirmRevokePlan === plan.address;

        let statusBadge = <span className="badge lime">ACTIVE</span>;
        if (isCompleted) {
          statusBadge = <span className="badge">COMPLETED</span>;
        } else if (isExpired) {
          statusBadge = <span className="badge">EXPIRED</span>;
        } else if (isDue) {
          statusBadge = <span className="badge lime">DUE NOW</span>;
        }

        return (
          <div key={plan.address} className="panel plan-card">
            <div className="flex-between" style={{ alignItems: "flex-start", gap: 12 }}>
              <div className="flex-start" style={{ gap: 12, alignItems: "center" }}>
                {target.logo ? (
                  <img
                    src={target.logo}
                    alt={target.name}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      objectFit: "contain",
                      background: "rgba(255, 255, 255, 0.05)",
                      padding: 2,
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                ) : target.isBasket ? (
                  <span
                    className="step-icon"
                    style={{
                      width: 36,
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 8,
                      background: "rgba(255, 255, 255, 0.06)",
                    }}
                  >
                    <Layers size={18} />
                  </span>
                ) : (
                  <span
                    className="step-icon"
                    style={{
                      width: 36,
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 8,
                      background: "rgba(255, 255, 255, 0.06)",
                    }}
                  >
                    <Repeat2 size={18} />
                  </span>
                )}
                <div>
                  <h3 style={{ fontSize: 17, margin: 0 }}>{target.name}</h3>
                  <div
                    className="flex-start"
                    style={{ gap: 8, marginTop: 4, alignItems: "center" }}
                  >
                    <span className="badge" style={{ fontSize: 10 }}>
                      {target.symbol}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(plan.address)}
                      className="text-link"
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        fontFamily: "monospace",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                      title="Copy plan account address"
                    >
                      {shorten(plan.address)}
                      {copiedAddress === plan.address ? (
                        <Check size={11} style={{ color: "var(--up)" }} />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                    <a
                      href={`https://explorer.solana.com/address/${plan.address}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-link"
                      style={{ fontSize: 11, color: "var(--muted)" }}
                      title="View on Solana Explorer"
                    >
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              </div>
              <div>{statusBadge}</div>
            </div>

            {target.isBasket && target.constituents.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--raised)",
                  fontSize: 11,
                  color: "var(--muted)",
                }}
              >
                <strong style={{ color: "var(--ink)" }}>Constituents:</strong>
                {target.constituents.map((s) => (
                  <span
                    key={s}
                    style={{
                      background: "rgba(255, 255, 255, 0.05)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            <div className="plan-stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 14 }}>
              <div>
                <small>Amount</small>
                <strong>{amountKusd} KUSD</strong>
              </div>
              <div>
                <small>Frequency</small>
                <span>{formatPeriod(plan.periodSeconds)}</span>
              </div>
              <div>
                <small>Progress</small>
                <span>
                  {plan.executedPeriods} of {plan.periods} ({Math.round((plan.executedPeriods / plan.periods) * 100)}%)
                </span>
              </div>
              <div>
                <small>Total plan limit</small>
                <span>{totalLimitKusd} KUSD</span>
              </div>
              <div>
                <small>Expires</small>
                <span>{formatDate(plan.expiresAt)}</span>
              </div>
              <div>
                <small>Account rent</small>
                <span style={{ color: "var(--up)" }}>~0.007 SOL (Reclaimable)</span>
              </div>
            </div>

            {/* Confirmation dialog for revocation */}
            {isConfirming && !isRevoking && (
              <div
                className="notice"
                style={{
                  borderColor: "var(--down, #ef4444)",
                  backgroundColor: "rgba(239, 68, 68, 0.08)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <AlertCircle size={18} style={{ color: "var(--down, #ef4444)", flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ fontSize: 13, color: "var(--ink)" }}>
                      Revoke this recurring plan and reclaim rent?
                    </strong>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                      This will cancel the subscription delegation in the Solana Subscriptions program and reclaim ~0.007 SOL of account rent back to your wallet.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setConfirmRevokePlan(null)}
                  >
                    Keep plan
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => handleRevoke(plan.address)}
                    style={{
                      borderColor: "var(--down, #ef4444)",
                      color: "var(--down, #ef4444)",
                    }}
                  >
                    Confirm revocation
                  </button>
                </div>
              </div>
            )}

            {isRevoking && (
              <div className="notice">
                <Loader2 size={16} className="spin" />
                <p style={{ margin: 0, fontSize: 12 }}>
                  Submitting revocation transaction… Please approve in your wallet to reclaim rent.
                </p>
              </div>
            )}

            {!isConfirming && !isRevoking && (
              <div className="plan-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => setConfirmRevokePlan(plan.address)}
                    title="Cancel subscription delegation and reclaim account rent"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <Pause size={12} />
                    Revoke / Cancel plan
                  </button>
                </div>
                <a
                  href={`https://explorer.solana.com/address/${plan.address}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn ghost small"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  Explorer <ExternalLink size={11} />
                </a>
              </div>
            )}
          </div>
        );
      })}

      <div className="notice" style={{ marginTop: 4 }}>
        <CircleHelp size={16} style={{ flexShrink: 0 }} />
        <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
          <strong>Autonomous on-chain subscriptions:</strong> Devnet plans run without custody via official Solana Subscriptions and the <code>kite_guard</code> program. Kite never holds user funds. To pause or cancel recurring investments at any time, click <strong>Revoke plan</strong> to cancel the delegation and immediately reclaim all account rent to your wallet.
        </p>
      </div>
    </div>
  );
}
