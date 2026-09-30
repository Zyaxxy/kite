"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  ExternalLink,
  Layers3,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet2,
} from "lucide-react";
import { holdingToSwapToken, type MainnetHolding } from "@kite/sdk";
import { useTradingAuth } from "./TradingAuth";
import { WalletButton } from "./WalletButton";
import { useWalletPortfolio } from "./useWalletPortfolio";
import { ActualTradePanel } from "./ActualTradePanel";
import { TokenAvatar } from "./SwapTokenSelector";
import { PortfolioAllocation } from "../kite/PortfolioAllocation";
import { money } from "../kite/MarketUI";
import styles from "../kite/Portfolio.module.css";

export function ActualPortfolio() {
  const auth = useTradingAuth();
  const { portfolio, error, loading, refresh, cached, stale } =
    useWalletPortfolio(auth.walletAddress, true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{
    holding: MainnetHolding;
    wallet: string;
  } | null>(null);
  const holdings = useMemo(
    () =>
      (portfolio?.holdings ?? []).filter((holding) =>
        `${holding.name} ${holding.symbol} ${holding.mint}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [portfolio, query],
  );

  if (!auth.walletAddress)
    return (
      <section className={styles.connect}>
        <div>
          <span className={styles.identityIcon}>
            <Wallet2 size={22} aria-hidden="true" />
          </span>
          <h2>
            Your wallet.
            <br />A clearer picture.
          </h2>
          <p>
            Connect to see your tokens, balances and allocation in one place.
            Your assets stay in your wallet; connecting does not approve a
            trade.
          </p>
        </div>
        <div className={styles.connectActions}>
          <button
            className="btn"
            disabled={!auth.configured || !auth.ready}
            onClick={auth.login}
          >
            Sign in with Privy
          </button>
          <WalletButton />
          {!auth.configured && (
            <p className="fineprint">
              Privy sign-in is not configured here. You can connect an external
              wallet.
            </p>
          )}
          <Link href="/app" className="text-link">
            Explore the markets first{" "}
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    );

  return (
    <section className={styles.workspace}>
      <div className={styles.toolbar}>
        <div className={styles.identity}>
          <span className={styles.identityIcon}>
            <Wallet2 size={19} aria-hidden="true" />
          </span>
          <div>
            <strong>Connected wallet</strong>
            <small>
              {auth.walletAddress.slice(0, 6)}…{auth.walletAddress.slice(-4)}
            </small>
          </div>
        </div>
        <button
          className="btn secondary small"
          disabled={loading}
          onClick={refresh}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {loading ? "Updating…" : "Refresh balances"}
        </button>
      </div>
      {loading && !portfolio && (
        <div role="status" className={styles.skeleton}>
          Reading your wallet balances and current prices…
        </div>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
          {portfolio
            ? " The last observation remains below."
            : " No balance estimate is being shown."}
        </p>
      )}
      {portfolio && (
        <>
          <div className={styles.overview}>
            <div className={styles.balance}>
              <div className={styles.balanceLabel}>
                <span>
                  {portfolio.hasUnpricedHoldings
                    ? "Priced wallet assets"
                    : "Wallet value"}
                </span>
                <ShieldCheck size={17} aria-hidden="true" />
              </div>
              <div className={styles.value}>
                {money(portfolio.pricedHoldingsValueUsd)}
              </div>
              <p>
                {portfolio.hasUnpricedHoldings
                  ? "A subtotal of holdings with available prices. Unpriced assets remain in your wallet and in the list below."
                  : "An observed valuation of the tokens in your wallet. You keep custody of every asset."}
              </p>
              <div className={styles.balanceActions}>
                <Link href="/baskets" className="btn small">
                  Explore baskets <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
                <Link href="/app">
                  Browse stocks <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <dl className={styles.stats}>
              <div>
                <dt>USDC balance</dt>
                <dd>{portfolio.usdcBalance}</dd>
                <small>Token units in your wallet</small>
              </div>
              <div>
                <dt>Native SOL</dt>
                <dd>{portfolio.solBalance}</dd>
                <small>Swaps and network fees</small>
              </div>
              <div>
                <dt>Held assets</dt>
                <dd>{portfolio.holdings.length}</dd>
                <small>Including unpriced tokens</small>
              </div>
              <div>
                <dt>Lifetime return</dt>
                <dd>Unavailable</dd>
                <small>A balance read cannot establish cost basis</small>
              </div>
            </dl>
          </div>
          <div className={styles.observation} role="status">
            <Clock3 size={15} aria-hidden="true" />
            <span>
              {cached
                ? "Saved in this browser session · refreshing"
                : stale
                  ? "Older observation"
                  : "Latest wallet observation"}{" "}
              ·{" "}
              {new Date(portfolio.observedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
              .{" "}
              {stale
                ? "Refresh before making a trading decision."
                : "Balances refresh while this page is visible."}
            </span>
          </div>
          {portfolio.warnings?.map((warning) => (
            <p className="notice" key={warning}>
              {warning}
            </p>
          ))}
          <PortfolioAllocation
            entries={portfolio.holdings.map((holding) => ({
              label: holding.symbol,
              value: holding.valueUsd ?? 0,
            }))}
            partial={portfolio.hasUnpricedHoldings}
          />
          <section
            className={styles.section}
            aria-labelledby="wallet-holdings-heading"
          >
            <div className={styles.sectionHead}>
              <div>
                <h2 id="wallet-holdings-heading">Your holdings</h2>
                <p>Individual tokens, held directly by you.</p>
              </div>
              {portfolio.holdings.length > 0 && (
                <label className={styles.search}>
                  <Search size={14} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Filter wallet holdings"
                    placeholder="Find an asset…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
              )}
            </div>
            {portfolio.holdings.length === 0 ? (
              <div className={styles.empty}>
                <Layers3 size={30} aria-hidden="true" />
                <h3>A place for your next idea.</h3>
                <p>
                  No funded tokens were found in this wallet. Explore the
                  catalog before making your first purchase.
                </p>
                <Link className="btn small" href="/app">
                  Explore assets <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>
            ) : holdings.length === 0 ? (
              <div className={styles.empty}>
                <h3>No matching holdings.</h3>
                <p>Try a company name, symbol or mint address.</p>
                <button className="text-link" onClick={() => setQuery("")}>
                  Clear search
                </button>
              </div>
            ) : (
              <table className={styles.holdings}>
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    <th scope="col" className={styles.hideMobile}>
                      Quantity
                    </th>
                    <th scope="col" className={styles.hideMobile}>
                      Token price
                    </th>
                    <th scope="col">Value</th>
                    <th scope="col">Trade</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => (
                    <tr key={holding.mint}>
                      <td>
                        <div className={styles.holdingName}>
                          <TokenAvatar token={holdingToSwapToken(holding)} />
                          <div>
                            <strong>{holding.symbol}</strong>
                            <small>{holding.name}</small>
                            <a
                              href={`https://solscan.io/token/${holding.mint}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {holding.verified
                                ? "View token"
                                : "Unverified token"}
                              <ExternalLink size={10} aria-hidden="true" />
                            </a>
                            <small className={styles.mobileQuantity}>
                              {holding.displayAmount ?? holding.amount} units
                            </small>
                          </div>
                        </div>
                      </td>
                      <td className={styles.hideMobile}>
                        {holding.displayAmount ?? holding.amount}
                        <small>
                          {holding.displayAmount !== holding.amount
                            ? `${holding.amount} token units`
                            : "Token units"}
                        </small>
                        {holding.frozenAmount &&
                          holding.frozenAmount !== "0" && (
                            <small>{holding.frozenAmount} frozen</small>
                          )}
                      </td>
                      <td className={styles.hideMobile}>
                        {money(holding.priceUsd)}
                      </td>
                      <td>
                        {money(holding.valueUsd)}
                        {holding.valuationUnavailableReason && (
                          <small>{holding.valuationUnavailableReason}</small>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="text-link"
                          disabled={
                            stale ||
                            holding.tradingHalted ||
                            holding.spendableAmount === "0"
                          }
                          title={
                            stale
                              ? "Refresh balances before opening a swap"
                              : undefined
                          }
                          onClick={() =>
                            setSelected({
                              holding,
                              wallet: portfolio.walletAddress,
                            })
                          }
                          aria-controls="wallet-swap"
                        >
                          {holding.tradingHalted
                            ? "Paused"
                            : holding.spendableAmount === "0"
                              ? "Frozen"
                              : "Swap"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {selected?.wallet === auth.walletAddress && (
            <div id="wallet-swap" className={styles.swap}>
              <div className="section-heading">
                <h3>Swap from your wallet</h3>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
              <ActualTradePanel
                key={`${selected.wallet}:${selected.holding.mint}`}
                asset={holdingToSwapToken(selected.holding)}
                initialSide="sell"
              />
            </div>
          )}
          <p className={styles.disclaimer}>
            Includes SPL and Token-2022 balances returned by the RPC. Allocation
            is based on priced holdings; it does not establish purchase cost or
            lifetime profit. Cached observations are display only and are
            refreshed before order forms use balances.
          </p>
        </>
      )}
    </section>
  );
}
