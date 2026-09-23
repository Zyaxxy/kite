"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CircleHelp,
  ExternalLink,
  Info,
  ListOrdered,
  Pause,
  Play,
  Plus,
  Repeat2,
  ShieldCheck,
  Wallet2,
} from "lucide-react";
import type { PaperFrequency } from "@kite/sdk";
import { useKite } from "./State";
import planStyles from "./Plans.module.css";
import { PageIntro } from "./Shell";
import { MarketStatus } from "./Discover";
import { AssetName, Change, Empty, money } from "./MarketUI";
import { OrbitArt } from "./Brand";
import { NativeSelect, NativeSelectOption } from "../ui/native-select";
import { useTradingAuth } from "../trading/TradingAuth";
import { RecurringInvestingPanel } from "../trading/RecurringInvestingPanel";
import { DevnetPlansList } from "../trading/DevnetPlansList";
import { ActualPortfolio } from "../trading/ActualPortfolio";
const WalletButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  {
    ssr: false,
    loading: () => (
      <button className="btn secondary" disabled>
        Loading wallet…
      </button>
    ),
  },
);
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function Portfolio() {
  const { paper, portfolio, snapshot, mode, hydrated } = useKite();
  return (
    <>
      <PageIntro
        eyebrow="Your collection"
        title="Ideas, taking shape."
        description={
          mode === "paper"
            ? "Your paper holdings, valued against live market prices. Your first investment starts your story."
            : "Your Solana wallet holdings. Tokens are held directly by your wallet."
        }
      />
      <MarketStatus />
      {mode === "actual" ? (
        <ActualPortfolio />
      ) : (
        <>
          <div className="portfolio-overview">
            <section className="panel portfolio-balance">
              <OrbitArt />
              <p className="eyebrow">Total paper value</p>
              <div className="detail-price">
                {hydrated ? money(portfolio.totalUsd) : "—"}
              </div>
              <div className="flex-start">
                <span className="badge lime">PAPER ACCOUNT</span>
                <span className="muted" style={{ fontSize: 11 }}>
                  Virtual funds, real prices
                </span>
              </div>
            </section>
            <dl className="panel portfolio-metrics">
              <div>
                <dt>Available to invest</dt>
                <dd>{money(paper.cashUsd)}</dd>
              </div>
              <div>
                <dt>Holdings value</dt>
                <dd>{money(portfolio.holdingsUsd)}</dd>
              </div>
              <div>
                <dt>Total paper return</dt>
                <dd>
                  <Change value={portfolio.profitLossPct} />
                </dd>
              </div>
              <div>
                <dt>Profit / loss</dt>
                <dd
                  className={
                    portfolio.profitLossUsd != null &&
                    portfolio.profitLossUsd < 0
                      ? "down"
                      : "up"
                  }
                >
                  {money(portfolio.profitLossUsd)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="section-head">
            <div>
              <h2>Your holdings</h2>
              <p>{paper.positions.length} assets in your paper portfolio</p>
            </div>
            <Link href="/markets" className="btn secondary small">
              <Plus size={13} />
              Add an investment
            </Link>
          </div>
          {portfolio.unpricedMints.length > 0 && (
            <div className="notice" style={{ marginBottom: 20 }}>
              <Info size={15} />
              Some holdings lack a live price. Total value is unavailable until
              all prices return.
            </div>
          )}
          {paper.positions.length ? (
            <table className="assets-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="num">Paper units</th>
                  <th className="num hide-mobile">Cost basis</th>
                  <th className="num">Value</th>
                  <th className="num hide-mobile">Return</th>
                </tr>
              </thead>
              <tbody>
                {paper.positions.map((p) => {
                  const asset = snapshot?.assets.find((a) => a.mint === p.mint);
                  const value =
                    asset?.priceUsd != null
                      ? p.quantity * asset.priceUsd
                      : null;
                  return (
                    <tr key={p.mint}>
                      <td>
                        {asset ? (
                          <AssetName asset={asset} />
                        ) : (
                          <Link href={`/stock/${p.mint}`}>{p.symbol}</Link>
                        )}
                      </td>
                      <td className="num">
                        {p.quantity.toLocaleString("en-US", {
                          maximumFractionDigits: 6,
                        })}
                      </td>
                      <td className="num hide-mobile">
                        {money(p.costBasisUsd)}
                      </td>
                      <td className="num">{money(value)}</td>
                      <td className="num hide-mobile">
                        <Change
                          value={
                            value != null && p.costBasisUsd > 0
                              ? ((value - p.costBasisUsd) / p.costBasisUsd) *
                                100
                              : null
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="panel">
              <Empty
                icon={Wallet2}
                title="Make room for your first idea"
                description="Use your virtual cash to try a stock or thematic basket. Your holdings will appear here after you place a paper order."
                action={
                  <Link href="/baskets" className="btn">
                    Explore thematic baskets
                    <ArrowUpRight size={14} />
                  </Link>
                }
              />
            </div>
          )}
          <p className="fineprint">
            Your starting paper balance is {money(paper.startingCashUsd)}.
            Returns reflect only your recorded paper trades at reference prices;
            they exclude fees, slippage and token scaling adjustments.
          </p>
        </>
      )}
      <section className="portfolio-activity">
        <Activity embedded />
      </section>
    </>
  );
}
export function Activity({ embedded = false }: { embedded?: boolean }) {
  const { paper, mode } = useKite();
  const auth = useTradingAuth();
  const exportOrders = () => {
    const rows = [
      [
        "Date",
        "Side",
        "Symbol",
        "Mint",
        "Paper units",
        "Price USD",
        "Total USD",
      ],
      ...paper.orders.map((o) => [
        o.createdAt,
        o.side,
        o.symbol,
        o.mint,
        String(o.quantity),
        String(o.priceUsd),
        String(o.totalUsd),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => '"' + c.replaceAll('"', '""') + '"').join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "kite-paper-orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      {!embedded && (
        <PageIntro
          eyebrow="Every step, recorded"
          title="Your activity."
          description="A clear record of the investments you have made."
        />
      )}
      <div className="section-head">
        <h2>
          {embedded
            ? "Recent activity"
            : mode === "paper"
              ? "Paper orders"
              : "Mainnet activity"}
        </h2>
        {mode === "paper" && paper.orders.length > 0 && (
          <button className="btn secondary small" onClick={exportOrders}>
            <ArrowDownToLine size={13} />
            Export CSV
          </button>
        )}
      </div>
      {mode === "actual" ? (
        <div className="panel">
          <Empty
            icon={ListOrdered}
            title={
              auth.walletAddress
                ? "Your onchain activity"
                : "Your wallet activity, together"
            }
            description={
              auth.walletAddress
                ? "View confirmed transactions and transfers for your connected wallet on Solscan."
                : "Connect your wallet to access its transaction history alongside your holdings."
            }
            action={
              auth.walletAddress ? (
                <a
                  href={`https://solscan.io/account/${auth.walletAddress}#transactions`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn secondary"
                >
                  View wallet activity <ArrowUpRight size={14} />
                </a>
              ) : (
                <Link href="/settings" className="btn secondary">
                  Connect your wallet <ArrowUpRight size={14} />
                </Link>
              )
            }
          />
        </div>
      ) : paper.orders.length ? (
        <table className="assets-table">
          <thead>
            <tr>
              <th>Order</th>
              <th className="hide-mobile">Time</th>
              <th className="num hide-mobile">Paper units</th>
              <th className="num">Total</th>
              <th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {(embedded ? paper.orders.slice(0, 6) : paper.orders).map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/stock/${o.mint}`}>
                    <strong style={{ fontWeight: 500 }}>
                      {o.side === "buy" ? "Buy" : "Sell"} {o.symbol}
                    </strong>
                    <small
                      className="muted"
                      style={{ display: "block", fontSize: 10, marginTop: 4 }}
                    >
                      @ {money(o.priceUsd)}
                    </small>
                  </Link>
                </td>
                <td className="hide-mobile muted">{date(o.createdAt)}</td>
                <td className="num hide-mobile">{o.quantity.toFixed(6)}</td>
                <td className="num">{money(o.totalUsd)}</td>
                <td className="num">
                  <span className="badge lime">
                    {o.swapId ? "PAPER SWAP" : "PAPER FILL"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="panel">
          <Empty
            icon={ListOrdered}
            title="A fresh page"
            description="Your completed paper orders will be recorded here. No preloaded trades, just your decisions."
            action={
              <Link href="/markets" className="btn">
                Find an investment <ArrowUpRight size={14} />
              </Link>
            }
          />
        </div>
      )}
    </>
  );
}
export function Plans() {
  const {
    paper,
    snapshot,
    mode,
    setMode,
    createPlan,
    togglePlan,
    hydrated,
    accountReadFailed,
  } = useKite();
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("25");
  const [frequency, setFrequency] = useState<PaperFrequency>("weekly");
  const [error, setError] = useState<string | null>(null);
  const [devnetPlanRefresh, setDevnetPlanRefresh] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const basket = params.get("basket"),
      stock = params.get("stock");
    if (basket) setTarget(`basket:${basket}`);
    else if (stock) setTarget(`asset:${stock}`);
    const requestedMode = params.get("mode");
    if (requestedMode === "paper" || requestedMode === "actual")
      setMode(requestedMode);
  }, [setMode]);
  const targets = [
    ...(snapshot?.baskets ?? []).map((b) => ({
      value: `basket:${b.id}`,
      id: b.id,
      name: b.name,
      type: "basket" as const,
    })),
    ...(snapshot?.assets ?? []).map((a) => ({
      value: `asset:${a.mint}`,
      id: a.mint,
      name: `${a.symbol} · ${a.name}`,
      type: "asset" as const,
    })),
  ];
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const selected = targets.find((t) => t.value === target);
      if (!selected)
        throw new Error("Choose an asset or basket for your plan.");
      createPlan({
        targetId: selected.id,
        targetType: selected.type,
        name: selected.name,
        amountUsd: Number(amount),
        frequency,
      });
      setTarget("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create plan.");
    }
  };
  return (
    <>
      <header className={planStyles.intro}>
        <div>
          <p className="eyebrow">RECURRING INVESTMENTS</p>
          <h1>Make investing a habit.</h1>
          <p>
            A little, at your own pace. Choose what to invest in and give it a
            schedule.
          </p>
        </div>
        <div
          className={planStyles.mode}
          role="group"
          aria-label="Recurring plan environment"
        >
          <button
            aria-pressed={mode === "actual"}
            onClick={() => setMode("actual")}
          >
            Devnet plans
          </button>
          <button
            aria-pressed={mode === "paper"}
            onClick={() => setMode("paper")}
          >
            Paper practice
          </button>
        </div>
      </header>
      <div className={planStyles.network}>
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>
            {mode === "actual"
              ? "A test environment, with you in control"
              : "Practice with virtual funds"}
          </strong>
          <p>
            {mode === "actual"
              ? "Recurring plans use Solana devnet and test tokens only. Mainnet recurring is unavailable."
              : "Paper plans stay on this device and run while Kite is open. No wallet approval is needed."}
          </p>
        </div>
        <span>{mode === "actual" ? "DEVNET" : "PAPER"}</span>
      </div>
      {mode === "actual" ? (
        <div className={planStyles.layout}>
          <div className="stack" style={{ gap: 32 }}>
            <DevnetPlansList
              refreshTrigger={devnetPlanRefresh}
              onPlanRevoked={() => setDevnetPlanRefresh((k) => k + 1)}
            />
            <section id="new-plan">
              <RecurringInvestingPanel
                onPlanConfirmed={() => setDevnetPlanRefresh((k) => k + 1)}
              />
            </section>
          </div>
          <aside className={planStyles.aside}>
            <div className={planStyles.guide}>
              <span className={planStyles.guideIcon}>
                <Repeat2 size={24} />
              </span>
              <p className="eyebrow">A SIMPLE ROUTINE</p>
              <h2>
                Your plan.
                <br />
                Your pace.
              </h2>
              <ol>
                <li>
                  <span>01</span>
                  <div>
                    <strong>Pick your investment</strong>
                    <p>A devnet stock or a curated basket of test tokens.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Set a comfortable rhythm</strong>
                    <p>
                      Choose an amount, frequency, and total number of
                      investments.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Review before you sign</strong>
                    <p>
                      Check the spending limit and token amounts in your wallet.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
            <div className={planStyles.details}>
              <h3>Before you begin</h3>
              <p>
                You’ll need devnet SOL for fees and test KUSD for installments.
                Use the test faucet in the plan builder below to claim 500 test KUSD and gas SOL instantly.
              </p>
              <p>
                Setup is verified before wallet signing. Scheduled collection is not
                yet running automatically.
              </p>
              <Link href="/settings" className="text-link">
                Connect a wallet <ArrowUpRight size={14} />
              </Link>
            </div>
          </aside>
        </div>
      ) : (
        <div className="plan-layout">
          <div className="stack">
            <div className="section-head" style={{ margin: 0 }}>
              <h2>Your recurring plans</h2>
              <span className="badge">
                {paper.plans.filter((p) => p.active).length} ACTIVE
              </span>
            </div>
            {paper.plans.length ? (
              paper.plans.map((plan) => (
                <div key={plan.id} className="panel plan-card">
                  <div className="flex-between">
                    <div className="flex-start">
                      <span className="step-icon">
                        <Repeat2 size={18} />
                      </span>
                      <h3 style={{ fontSize: 17 }}>{plan.name}</h3>
                    </div>
                    <span className={`badge ${plan.active ? "lime" : ""}`}>
                      {plan.active ? "ACTIVE" : "PAUSED"}
                    </span>
                  </div>
                  <div className="plan-stats">
                    <div>
                      <small>Paper amount</small>
                      {money(plan.amountUsd)}
                    </div>
                    <div>
                      <small>Frequency</small>
                      <span style={{ textTransform: "capitalize" }}>
                        {plan.frequency}
                      </span>
                    </div>
                    <div>
                      <small>Next due</small>
                      {date(plan.nextExecutionAt)}
                    </div>
                  </div>
                  {plan.lastError && (
                    <div className="notice error">{plan.lastError}</div>
                  )}
                  <div className="plan-actions">
                    <button
                      className="btn secondary small"
                      onClick={() => togglePlan(plan.id)}
                    >
                      {plan.active ? <Pause size={12} /> : <Play size={12} />}{" "}
                      {plan.active ? "Pause plan" : "Resume plan"}
                    </button>
                    <Link
                      className="btn ghost small"
                      href={
                        plan.targetType === "basket"
                          ? `/basket/${plan.targetId}`
                          : `/stock/${plan.targetId}`
                      }
                    >
                      View investment <ArrowUpRight size={12} />
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="panel">
                <Empty
                  icon={Repeat2}
                  title="Give your ideas a rhythm"
                  description="Create your first paper plan. Pick a stock or basket, an amount, and how often you want to invest."
                />
              </div>
            )}
            <div className="notice">
              <CircleHelp size={16} />
              <p>
                Paper plans execute when this app is open and fresh prices are
                available. Missed intervals are not backfilled. These are local
                simulations, not unattended onchain mandates.
              </p>
            </div>
          </div>
          <aside className="panel trade-panel" id="new-plan">
            <h2>Create a paper plan</h2>
            <p className="fineprint" style={{ margin: "10px 0 23px" }}>
              Recurring investments using virtual USD.
            </p>
            <form className="stack" onSubmit={submit}>
              <label className="form-field">
                Invest in
                <NativeSelect
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  required
                >
                  <NativeSelectOption value="">
                    Choose an asset or basket
                  </NativeSelectOption>
                  <optgroup label="Thematic baskets">
                    {targets
                      .filter((t) => t.type === "basket")
                      .map((t) => (
                        <NativeSelectOption key={t.value} value={t.value}>
                          {t.name}
                        </NativeSelectOption>
                      ))}
                  </optgroup>
                  <optgroup label="Mainnet assets">
                    {targets
                      .filter((t) => t.type === "asset")
                      .map((t) => (
                        <NativeSelectOption key={t.value} value={t.value}>
                          {t.name}
                        </NativeSelectOption>
                      ))}
                  </optgroup>
                </NativeSelect>
              </label>
              <label className="form-field">
                Amount per installment (virtual USD)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="form-field">
                How often
                <NativeSelect
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value as PaperFrequency)
                  }
                >
                  <NativeSelectOption value="daily">
                    Every day
                  </NativeSelectOption>
                  <NativeSelectOption value="weekly">
                    Every week
                  </NativeSelectOption>
                  <NativeSelectOption value="biweekly">
                    Every two weeks
                  </NativeSelectOption>
                  <NativeSelectOption value="monthly">
                    Every month
                  </NativeSelectOption>
                </NativeSelect>
              </label>
              {error && (
                <div className="notice error" role="alert">
                  {error}
                </div>
              )}
              <button
                type="submit"
                className="btn full"
                disabled={!hydrated || accountReadFailed || !target}
              >
                Create paper plan <ArrowUpRight size={15} />
              </button>
            </form>
            <p className="fineprint">
              The first installment is due after one interval. Pause or resume
              any time. No wallet signature or deposit is required.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
export function Settings() {
  const auth = useTradingAuth();
  const { mode, paper, snapshot, resetPaper, notify } = useKite();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <>
      <PageIntro
        eyebrow="Built around you"
        title="Your space. Your rules."
        description="Manage your account, trading mode and data sources."
      />
      <div className="settings-layout stack">
        <section className="panel panel-pad">
          <div className="section-head">
            <h2>Your actual trading account</h2>
            <ShieldCheck size={21} className="up" />
          </div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.8 }}>
            Sign in with Privy or connect your existing Solana wallet. You
            review each mainnet trade before signing.
          </p>
          <div className="settings-row">
            <div>
              <h3>Sign in with Privy</h3>
              <p>
                {auth.privyAuthenticated
                  ? "Your Privy account is signed in."
                  : auth.privyConfigured
                    ? "Use your email or wallet to access actual trading."
                    : "Privy sign-in is not configured for this deployment yet. Connect your existing wallet below."}
              </p>
            </div>
            {auth.privyAuthenticated ? (
              <button
                className="btn secondary"
                onClick={() => void auth.logout()}
              >
                Sign out
              </button>
            ) : (
              <button
                className="btn"
                disabled={!auth.privyConfigured || !auth.ready}
                onClick={auth.login}
              >
                Sign in with Privy <ArrowUpRight size={14} />
              </button>
            )}
          </div>
          <div className="settings-row">
            <div>
              <h3>Connect a Solana wallet</h3>
              <p>
                Use a wallet supporting Solana mainnet. Your keys remain with
                your wallet.
              </p>
            </div>
            <WalletButton />
          </div>
          {auth.walletAddress && (
            <div className="settings-row">
              <div>
                <h3>Connected address</h3>
                <p className="address">{auth.walletAddress}</p>
              </div>
              <a
                href={`https://solscan.io/account/${auth.walletAddress}`}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                View activity <ExternalLink size={13} />
              </a>
            </div>
          )}
        </section>
        <section className="panel panel-pad">
          <h2>Trading preferences</h2>
          <div className="settings-row">
            <div>
              <h3>Choose your mode</h3>
              <p>
                {mode === "paper"
                  ? "You’re practicing with virtual funds and real market prices."
                  : "You’re viewing actual trading. Transactions require your wallet approval."}
              </p>
            </div>
            <span className="muted">Change mode in the header</span>
          </div>
          <div className="settings-row">
            <div>
              <h3>Reset your paper account</h3>
              <p>
                Start again with {money(paper.startingCashUsd)} in virtual cash.
                This clears paper holdings, orders and recurring plans stored on
                this device.
              </p>
            </div>
            {confirmReset ? (
              <div className="flex-start">
                <button
                  className="btn secondary"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    resetPaper();
                    setConfirmReset(false);
                  }}
                >
                  Confirm reset
                </button>
              </div>
            ) : (
              <button
                className="btn secondary"
                onClick={() => setConfirmReset(true)}
              >
                Reset paper account
              </button>
            )}
          </div>
        </section>
        <section className="panel panel-pad">
          <h2>Connected to the real world</h2>
          <div className="settings-row">
            <div>
              <h3>Network</h3>
              <p>All market discovery and actual trades use Solana mainnet.</p>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <h3>Market sources</h3>
              <p>
                Official xStocks and PreStocks issuer catalogs, with Jupiter
                token prices and metadata. Unknown values remain unavailable.
              </p>
            </div>
            <span className="badge">{snapshot?.status ?? "CONNECTING"}</span>
          </div>
          {snapshot?.warnings.map((warning, i) => (
            <div className="notice" style={{ marginTop: 12 }} key={i}>
              <Info size={15} />
              {warning}
            </div>
          ))}
          <div
            className="flex-start"
            style={{ marginTop: 19, flexWrap: "wrap" }}
          >
            <a
              href="https://xstocks.com"
              className="text-link"
              target="_blank"
              rel="noreferrer"
            >
              xStocks <ExternalLink size={11} />
            </a>
            <a
              href="https://prestocks.com"
              className="text-link"
              target="_blank"
              rel="noreferrer"
            >
              PreStocks <ExternalLink size={11} />
            </a>
            <a
              href="https://dev.jup.ag"
              className="text-link"
              target="_blank"
              rel="noreferrer"
            >
              Jupiter <ExternalLink size={11} />
            </a>
          </div>
        </section>
        <p className="fineprint">
          Paper data and watchlists are saved locally on this device. They are
          separate from your actual wallet and do not sync between web and
          mobile.
        </p>
      </div>
    </>
  );
}
