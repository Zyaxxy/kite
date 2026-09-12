"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  ChevronRight,
  Compass,
  Globe2,
  Layers3,
  ListOrdered,
  Search,
  Settings2,
  ShieldCheck,
  Wallet2,
  X,
  Repeat2,
  Check,
  Menu,
} from "lucide-react";
import { Brand } from "./Brand";
import { AssetName, money } from "./MarketUI";
import { useKite } from "./State";
import { useTradingAuth } from "../trading/TradingAuth";

const navigation = [
  { href: "/app", label: "Discover", icon: Compass },
  { href: "/markets", label: "Markets", icon: Globe2 },
  { href: "/baskets", label: "Thematic baskets", icon: Layers3 },
  { href: "/portfolio", label: "Portfolio", icon: Wallet2 },
  { href: "/sip", label: "Recurring plans", icon: Repeat2 },
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  { href: "/orders", label: "Activity", icon: ListOrdered },
];
export function SignInButton() {
  const auth = useTradingAuth();
  return (
    <Link className="btn small secondary" href="/settings">
      {auth.authenticated ? "My account" : "Sign in"} <ArrowUpRight size={13} />
    </Link>
  );
}
export function ModeSwitch() {
  const { mode, setMode } = useKite();
  return (
    <div className="mode-switch" role="group" aria-label="Trading mode">
      <button
        aria-pressed={mode === "paper"}
        className={mode === "paper" ? "active" : ""}
        onClick={() => setMode("paper")}
      >
        Paper trading
      </button>
      <button
        aria-pressed={mode === "actual"}
        className={mode === "actual" ? "active" : ""}
        onClick={() => setMode("actual")}
      >
        Actual trading
      </button>
    </div>
  );
}
export function Shell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const path = usePathname();
  const { snapshot, toast, clearToast } = useKite();
  const [searchOpen, setSearchOpen] = useState(false);
  const active = (href: string) =>
    path === href ||
    (href === "/markets" && path.startsWith("/stock/")) ||
    (href === "/baskets" && path.startsWith("/basket/"));
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <p className="eyebrow nav-label">Your workspace</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${active(href) ? "active" : ""}`}
              aria-current={active(href) ? "page" : undefined}
            >
              <Icon strokeWidth={1.5} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="eyebrow">Your keys. Your Kite.</span>
            <p>
              Explore ideas in paper mode. Trade onchain from your own wallet.
            </p>
            <Link href="/settings" className="text-link">
              Meet your account <ArrowUpRight size={13} />
            </Link>
          </div>
          <Link
            href="/settings"
            className={`nav-item ${path === "/settings" ? "active" : ""}`}
          >
            <Settings2 strokeWidth={1.5} />
            Settings
          </Link>
          <div className="network-label">
            <span className="status-dot" /> Solana mainnet{" "}
            <ArrowUpRight size={11} style={{ marginLeft: "auto" }} />
          </div>
        </div>
      </aside>
      <header className="topbar">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="breadcrumb">
          Workspace <ChevronRight size={12} />
          <strong>{title}</strong>
        </div>
        <div className="top-actions">
          <button
            className="search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Search assets"
          >
            <Search size={15} />
            <span>Search anything</span>
            <kbd>⌘ K</kbd>
          </button>
          <span className="badge lime">
            <span className="status-dot" />
            MAINNET
          </span>
          <SignInButton />
        </div>
      </header>
      <main className="workspace-main">
        {children}
        <footer className="page-footer">
          <span>
            <ShieldCheck size={12} /> Self-custody, by design
          </span>
          <span>
            Solana mainnet ·{" "}
            {snapshot?.status === "live"
              ? "Live market data"
              : snapshot?.status === "partial"
                ? "Some feeds unavailable"
                : "Connecting to market data"}
          </span>
          <Link href="/settings">
            Data & account settings <ArrowUpRight size={10} />
          </Link>
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation
          .filter((n) =>
            ["/app", "/markets", "/baskets", "/portfolio", "/sip"].includes(
              n.href,
            ),
          )
          .map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={active(href) ? "active" : ""}
              aria-current={active(href) ? "page" : undefined}
            >
              <Icon strokeWidth={1.6} />
              {label === "Thematic baskets"
                ? "Baskets"
                : label === "Recurring plans"
                  ? "Plans"
                  : label}
            </Link>
          ))}
        <details className="mobile-more">
          <summary>
            <Menu size={19} />
            <span>More</span>
          </summary>
          <nav className="more-links" aria-label="More navigation">
            <Link href="/watchlist">
              <Bookmark size={16} />
              Watchlist
            </Link>
            <Link href="/orders">
              <ListOrdered size={16} />
              Activity
            </Link>
            <Link href="/settings">
              <Settings2 size={16} />
              Settings
            </Link>
          </nav>
        </details>
      </nav>
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            className="icon-btn"
            onClick={clearToast}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { snapshot } = useKite();
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    input.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          "input,button,a[href]",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose]);
  const results = (snapshot?.assets ?? [])
    .filter((a) =>
      `${a.name} ${a.symbol} ${a.mint}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .slice(0, 12);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search mainnet assets"
      >
        <div className="modal-header">
          <Search size={20} />
          <input
            ref={input}
            placeholder="Search companies, symbols or mints"
            aria-label="Search companies, symbols or mints"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="icon-btn"
            aria-label="Close search"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {results.length ? (
            results.map((asset) => (
              <div key={asset.mint} className="search-result" onClick={onClose}>
                <AssetName asset={asset} />
                <span className="muted">{money(asset.priceUsd)}</span>
              </div>
            ))
          ) : (
            <div className="empty">
              <h3>
                {snapshot?.assets.length
                  ? "No matching assets"
                  : "Waiting for market data"}
              </h3>
              <p>
                {snapshot?.assets.length
                  ? "Try a company name or an exact mint address."
                  : "Search will be available when the issuer catalogs load."}
              </p>
            </div>
          )}
        </div>
        <div className="modal-footer">
          Verified issuer catalogs · Solana mainnet{" "}
          <span style={{ float: "right" }}>ESC to close</span>
        </div>
      </div>
    </div>
  );
}
export function PageIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children ?? <ModeSwitch />}
    </div>
  );
}
