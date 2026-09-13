"use client";

import { useState } from "react";
import Link from "next/link";
import { holdingToSwapToken, type MainnetHolding } from "@kite/sdk";
import { useTradingAuth } from "./TradingAuth";
import { WalletButton } from "./WalletButton";
import { useWalletPortfolio } from "./useWalletPortfolio";
import { ActualTradePanel } from "./ActualTradePanel";
import { TokenAvatar } from "./SwapTokenSelector";

const usd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );

export function ActualPortfolio() {
  const auth = useTradingAuth();
  const { portfolio, error, loading, refresh } = useWalletPortfolio(
    auth.walletAddress,
  );
  const [selected, setSelected] = useState<{
    holding: MainnetHolding;
    wallet: string;
  } | null>(null);

  if (!auth.walletAddress)
    return (
      <section className="panel empty-state">
        <h2>Your wallet, your assets.</h2>
        <p>
          Sign in with Privy or connect your wallet to see your actual mainnet
          holdings.
        </p>
        <button
          className="btn"
          disabled={!auth.configured || !auth.ready}
          onClick={auth.login}
        >
          Sign in with Privy
        </button>
        {!auth.configured && (
          <p className="fineprint">
            Privy sign-in is not configured for this deployment.
          </p>
        )}
        <WalletButton />
      </section>
    );

  return (
    <section className="actual-portfolio">
      <div className="section-heading">
        <div>
          <h2>Actual holdings</h2>
          <p className="fineprint">
            {auth.walletAddress.slice(0, 6)}…{auth.walletAddress.slice(-4)}
          </p>
        </div>
        <button className="btn secondary" disabled={loading} onClick={refresh}>
          {loading ? "Refreshing…" : "Refresh balances"}
        </button>
      </div>
      {loading && !portfolio && (
        <p role="status" className="notice">
          Reading your mainnet wallet balances…
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {portfolio && (
        <>
          <div className="metric-grid">
            <article className="panel">
              <p className="eyebrow">
                {portfolio.hasUnpricedHoldings
                  ? "Priced wallet assets"
                  : "Wallet value"}
              </p>
              <h2>{usd(portfolio.pricedHoldingsValueUsd)}</h2>
              {portfolio.hasUnpricedHoldings && (
                <p className="fineprint">
                  A subtotal of assets with verified prices. Unpriced holdings
                  remain listed below.
                </p>
              )}
            </article>
            <article className="panel">
              <p className="eyebrow">USDC balance</p>
              <h2>{portfolio.usdcBalance}</h2>
              <p className="fineprint">In your wallet</p>
            </article>
            <article className="panel">
              <p className="eyebrow">Native SOL balance</p>
              <h2>{portfolio.solBalance}</h2>
              <p className="fineprint">Available for swaps and network fees</p>
            </article>
          </div>
          {portfolio.warnings?.map((warning) => (
            <p className="notice" key={warning}>
              {warning}
            </p>
          ))}
          {portfolio.holdings.length === 0 ? (
            <div className="panel empty-state">
              <h3>No funded tokens in this wallet.</h3>
              <p>
                Your mainnet tokens will appear here when your wallet is funded.
              </p>
              <Link className="btn" href="/app">
                Explore assets
              </Link>
            </div>
          ) : (
            <div className="panel table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Value</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.holdings.map((holding) => (
                    <tr key={holding.mint}>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <TokenAvatar token={holdingToSwapToken(holding)} />
                          <div>
                            <strong>{holding.symbol}</strong>
                            <p className="fineprint">{holding.name}</p>
                          </div>
                        </div>
                        <a
                          className="fineprint"
                          href={`https://solscan.io/token/${holding.mint}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {holding.mint.slice(0, 5)}…{holding.mint.slice(-4)}
                          {holding.verified ? "" : " · Unverified"}
                        </a>
                      </td>
                      <td>
                        {holding.displayAmount ?? holding.amount}
                        <p className="fineprint">
                          {holding.displayAmount !== holding.amount
                            ? `${holding.amount} token units`
                            : "Token units"}
                        </p>
                        {holding.frozenAmount &&
                          holding.frozenAmount !== "0" && (
                            <p className="fineprint">
                              {holding.frozenAmount} frozen
                            </p>
                          )}
                      </td>
                      <td>
                        {holding.priceUsd === null
                          ? "Unavailable"
                          : usd(holding.priceUsd)}
                      </td>
                      <td>
                        {holding.valueUsd === null
                          ? "Unavailable"
                          : usd(holding.valueUsd)}
                        {holding.valuationUnavailableReason && (
                          <p className="fineprint">
                            {holding.valuationUnavailableReason}
                          </p>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="text-link"
                          disabled={
                            holding.tradingHalted ||
                            holding.spendableAmount === "0"
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
            </div>
          )}
          {selected?.wallet === auth.walletAddress && (
            <div
              id="wallet-swap"
              className="panel"
              style={{ maxWidth: 520, margin: "24px auto" }}
            >
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
          <p className="fineprint">
            Balances observed{" "}
            {new Date(portfolio.observedAt).toLocaleTimeString()}. All SPL and
            Token-2022 accounts are included. Cost basis and profit are not
            available from a wallet balance alone.
          </p>
        </>
      )}
    </section>
  );
}
