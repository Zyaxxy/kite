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
  useEffect(() => setLimit(12), [query]);
  const matches = securities.filter((security) =>
    `${security.name} ${security.symbol} ${security.cusip ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const tokenByMint = new Map(assets.map((asset) => [asset.mint, asset]));
  return (
    <>
      <Dialog.Root>
        <div className={styles.banner}>
          <BriefcaseBusiness size={22} aria-hidden="true" />
          <div>
            <strong>Meet Backpack securities</strong>
            <p>
              A broader catalog to explore. Availability depends on each
              listing.
            </p>
          </div>
          <Dialog.Trigger className="text-link">
            How it works <ArrowUpRight size={14} />
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
            <Dialog.Title>More companies. A closer look.</Dialog.Title>
            <Dialog.Description>
              Browse Backpack’s official securities catalog alongside Kite’s
              token markets. A listing alone does not mean it can be traded on
              Solana.
            </Dialog.Description>
            <div className={styles.points}>
              <div>
                <strong>Access beyond the regular session</strong>
                <p>
                  Sessions and available spot markets vary by security. Extended
                  trading is not available for every listing.
                </p>
              </div>
              <div>
                <strong>Dividends and corporate actions</strong>
                <p>
                  Backpack describes reinvestment and corporate-action handling
                  for its tokenized product. Check the terms that apply to your
                  security.
                </p>
              </div>
              <div>
                <strong>Know what you hold</strong>
                <p>
                  Brokerage entitlements and tokenized claims have different
                  legal structures. Eligibility, transfer and redemption
                  conditions apply.
                </p>
              </div>
              <div>
                <strong>Verified before trading</strong>
                <p>
                  Kite needs an official Solana mint, enabled transfers and an
                  executable route. Discovery-only securities cannot be bought
                  in Kite.
                </p>
              </div>
            </div>
            <a
              href="https://learn.backpack.exchange/articles/how-to-hold-spcx"
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              Read Backpack’s product explanation <ArrowUpRight size={14} />
            </a>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
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
                  Availability on Kite
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.slice(0, limit).map((security) => {
                const asset = security.solanaMint
                  ? tokenByMint.get(security.solanaMint)
                  : undefined;
                const eligible =
                  !security.discoveryOnly && asset && !asset.tradingHalted;
                return (
                  <TableRow key={security.id}>
                    <TableCell>
                      <div className={styles.security}>
                        <span className={styles.monogram} aria-hidden="true">
                          {security.underlyingSymbol.slice(0, 2)}
                        </span>
                        <div>
                          <strong>{security.name}</strong>
                          <small>{security.symbol} · Backpack</small>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="num">
                      {eligible ? (
                        <Link
                          className={styles.marketLink}
                          href={`/stock/${encodeURIComponent(asset.mint)}`}
                        >
                          View token market <ArrowUpRight size={13} />
                        </Link>
                      ) : (
                        <span className={styles.availability}>
                          Discovery only
                        </span>
                      )}
                      <small className={styles.detail}>
                        {eligible
                          ? "Quote required to trade"
                          : security.solanaMint
                            ? "Transfers or pricing unavailable"
                            : "Solana mint not verified"}
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
        . Prices are shown only for verified token markets.
      </p>
    </>
  );
}
