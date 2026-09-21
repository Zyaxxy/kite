"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, X } from "lucide-react";
import type { BackpackSecurity, MarketAsset } from "@kite/sdk";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { AssetAvatar } from "./AssetAvatar";
import styles from "./BackpackCatalog.module.css";

export function BackpackCatalog({
  securities,
  assets,
  query,
  loading,
}: {
  securities: BackpackSecurity[];
  assets: MarketAsset[];
  query: string;
  loading: boolean;
}) {
  const [limit, setLimit] = useState(12);
  const [filterMode, setFilterMode] = useState<"all" | "tradable" | "discovery">(
    "all",
  );

  useEffect(() => setLimit(12), [query, filterMode]);

  const tokenByMint = new Map(assets.map((asset) => [asset.mint, asset]));

  const isTradableOnKite = (security: BackpackSecurity): boolean => {
    const asset = security.solanaMint
      ? tokenByMint.get(security.solanaMint)
      : undefined;
    return Boolean(!security.discoveryOnly && asset && !asset.tradingHalted);
  };

  const tradableTotal = securities.filter(isTradableOnKite).length;
  const discoveryTotal = securities.length - tradableTotal;

  const queryFiltered = securities.filter((security) =>
    `${security.name} ${security.symbol} ${security.cusip ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  const filtered = queryFiltered.filter((security) => {
    if (filterMode === "tradable") return isTradableOnKite(security);
    if (filterMode === "discovery") return !isTradableOnKite(security);
    return true;
  });

  // When in "all" mode, prioritize tradable Solana assets at the top
  const matches = [...filtered].sort((a, b) => {
    if (filterMode === "all") {
      const aTradable = isTradableOnKite(a);
      const bTradable = isTradableOnKite(b);
      if (aTradable && !bTradable) return -1;
      if (!aTradable && bTradable) return 1;
    }
    return a.symbol.localeCompare(b.symbol);
  });

  return (
    <>
      <Dialog.Root>
        <div className={styles.banner}>
          <BriefcaseBusiness size={22} aria-hidden="true" />
          <div>
            <strong>Backpack Securities &amp; Exchange Routing</strong>
            <p>
              Assets marked “Tradable on Solana” are verified on-chain tokens you can trade on Kite.
              Discovery-only assets trade on Backpack’s centralized exchange under off-chain custody.
            </p>
          </div>
          <Dialog.Trigger className="text-link">
            Exchange disclaimer <ArrowUpRight size={14} />
          </Dialog.Trigger>
        </div>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog}>
            <Dialog.Close
              className={styles.close}
              aria-label="Close Backpack information"
            >
              <X size={20} />
            </Dialog.Close>
            <p className="eyebrow">BACKPACK SECURITIES</p>
            <Dialog.Title>Self-Custody vs. Centralized Exchange Trading</Dialog.Title>
            <Dialog.Description>
              Backpack securities fall into two distinct availability tiers:
            </Dialog.Description>
            <div className={styles.points}>
              <div>
                <strong>1. Tradable on Solana (Self-Custody on Kite)</strong>
                <p>
                  Tokens with verified Solana SPL/Token-2022 mints and enabled transfers settle directly into your connected Solana wallet (Phantom, Solflare, etc.). Kite never holds your tokens in a vault.
                </p>
              </div>
              <div>
                <strong>2. Discovery-Only (Centralized on Backpack Exchange)</strong>
                <p>
                  These listings operate exclusively on Backpack’s centralized off-chain order book. Backpack has not enabled on-chain Solana withdrawals for them (withdrawEnabled: false). Clicking “Trade on Backpack” will redirect you to Backpack’s third-party platform.
                </p>
              </div>
              <div>
                <strong>3. Regulatory &amp; Custody Notice</strong>
                <p>
                  Trading on Backpack Exchange requires a verified Backpack account, identity verification (KYC), and compliance with Backpack’s jurisdictional terms. Backpack holds custody of those assets. Kite is completely independent and does not manage or execute off-chain exchange trades.
                </p>
              </div>
              <div>
                <strong>4. Alternative on Kite: xStocks</strong>
                <p>
                  For major US equities (such as Apple, Microsoft, Nvidia, and Tesla), fully transferable Token-2022 tokens are available under the xStocks tab on Kite with atomic on-chain execution.
                </p>
              </div>
            </div>
            <a
              href="https://learn.backpack.exchange/articles/how-to-hold-spcx"
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              Read Backpack’s official documentation <ArrowUpRight size={14} />
            </a>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <div className={styles.filterBar}>
        <div
          className={styles.filterTabs}
          role="tablist"
          aria-label="Filter Backpack listings"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === "all"}
            className={
              filterMode === "all" ? styles.filterActive : styles.filterBtn
            }
            onClick={() => setFilterMode("all")}
          >
            All listings{" "}
            <span className={styles.filterCount}>{securities.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === "tradable"}
            className={
              filterMode === "tradable"
                ? styles.filterActive
                : styles.filterBtn
            }
            onClick={() => setFilterMode("tradable")}
          >
            Tradable on Solana{" "}
            <span className={styles.filterCount}>{tradableTotal}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === "discovery"}
            className={
              filterMode === "discovery"
                ? styles.filterActive
                : styles.filterBtn
            }
            onClick={() => setFilterMode("discovery")}
          >
            Discovery only{" "}
            <span className={styles.filterCount}>{discoveryTotal}</span>
          </button>
        </div>
      </div>

      {matches.length ? (
        <>
          <Table
            className={`assets-table catalog-table ${styles.table}`}
            aria-label="Backpack securities catalog"
          >
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Security</TableHead>
                <TableHead scope="col" className="num">
                  Market &amp; Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.slice(0, limit).map((security) => {
                const asset = security.solanaMint
                  ? tokenByMint.get(security.solanaMint)
                  : undefined;
                const eligible = isTradableOnKite(security);
                const backpackTradeUrl = `https://backpack.exchange/trade/${encodeURIComponent(security.underlyingSymbol)}_USDC`;

                return (
                  <TableRow key={security.id}>
                    <TableCell>
                      <div className={styles.security}>
                        <AssetAvatar
                          asset={{
                            symbol: security.symbol,
                            underlyingSymbol: security.underlyingSymbol,
                            issuer: "backpack",
                            mint: security.solanaMint ?? undefined,
                            logoUrl:
                              asset?.logoUrl ??
                              `https://backpack.exchange/api/stock-logo/${encodeURIComponent(security.underlyingSymbol)}`,
                          }}
                          label={security.name}
                        />
                        <div>
                          <strong>{security.name}</strong>
                          <small>{security.symbol} · Backpack</small>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="num">
                      {eligible && asset ? (
                        <Link
                          className={styles.marketLink}
                          href={`/stock/${encodeURIComponent(asset.mint)}`}
                        >
                          Trade on Kite <ArrowUpRight size={13} />
                        </Link>
                      ) : (
                        <a
                          className={styles.externalTradeLink}
                          href={backpackTradeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Trade on Backpack centralized exchange (CEX, off-chain custody)"
                        >
                          Trade on Backpack <ArrowUpRight size={13} />
                        </a>
                      )}
                      <small className={styles.detail}>
                        {eligible
                          ? "Verified Solana token market"
                          : "Centralized CEX · External custody"}
                      </small>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="market-count catalog-count">
            <span>
              {Math.min(limit, matches.length)} of {matches.length} securities
            </span>
            {limit < matches.length && (
              <button
                className="text-link"
                onClick={() => setLimit((value) => value + 24)}
              >
                Show more <ArrowRight size={14} />
              </button>
            )}
          </div>
        </>
      ) : (
        <p className={styles.empty} role="status">
          {loading
            ? "Loading Backpack securities…"
            : securities.length
              ? "No matching securities. Try another company or symbol."
              : "The Backpack catalog is temporarily unavailable. Refresh prices to retry."}
        </p>
      )}
      <p className={styles.source}>
        Source:{" "}
        <a
          href="https://api.backpack.exchange/api/v1/securities"
          target="_blank"
          rel="noreferrer"
        >
          Backpack securities catalog
        </a>
        . Off-chain centralized trading on Backpack Exchange requires a Backpack account and separate custody.
      </p>
    </>
  );
}
