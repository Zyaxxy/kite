"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Compass,
  FileText,
  Layers3,
  ListOrdered,
  LogOut,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
  Wallet2,
  X,
  Repeat2,
  Check,
  Plus,
} from "lucide-react";
import { Brand } from "./Brand";
import { TradingModeSwitch } from "./TradingModeSwitch";
import { AssetName, money } from "./MarketUI";
import { useKite } from "./State";
import { useTradingAuth } from "../trading/TradingAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const navigation = [
  { href: "/app", label: "Discover", icon: Compass },
  { href: "/baskets", label: "Baskets", icon: Layers3 },
  { href: "/sip", label: "Recurring", icon: Repeat2 },
  { href: "/portfolio", label: "Portfolio", icon: Wallet2 },
];
function isActive(path: string, href: string) {
  return (
    path === href ||
    (href === "/app" &&
      (path === "/markets" ||
        path.startsWith("/stock/") ||
        path === "/watchlist")) ||
    (href === "/baskets" && path.startsWith("/basket/")) ||
    (href === "/portfolio" && path === "/orders")
  );
}

export function PrimaryNavigation({ landing = false }: { landing?: boolean }) {
  const path = usePathname();
  return (
    <nav
      className="primary-navigation"
      aria-label={landing ? "Website navigation" : "Main navigation"}
    >
      {navigation.map(({ href, label }) =>
        href === "/sip" ? (
          <DropdownMenu key={href}>
            <DropdownMenuTrigger
              className={`primary-nav-link ${isActive(path, href) ? "active" : ""}`}
            >
              {label}
              <ChevronDown size={13} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="recurring-nav-menu">
              <div className="kite-menu-heading">
                <span className="eyebrow">A little, regularly</span>
                <p>Make room for your next idea.</p>
              </div>
              <DropdownMenuLinkItem render={<Link href="/sip" />}>
                <Repeat2 size={17} />
                <span>
                  Your recurring plans
                  <small>View and manage your schedule</small>
                </span>
                <ArrowUpRight size={14} />
              </DropdownMenuLinkItem>
              <DropdownMenuLinkItem render={<Link href="/sip#new-plan" />}>
                <Plus size={17} />
                <span>
                  Create a plan<small>Choose an asset and frequency</small>
                </span>
                <ArrowUpRight size={14} />
              </DropdownMenuLinkItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link
            key={href}
            href={href}
            className={`primary-nav-link ${isActive(path, href) ? "active" : ""}`}
            aria-current={isActive(path, href) ? "page" : undefined}
          >
            {label}
          </Link>
        ),
      )}
    </nav>
  );
}

export function AccountMenu() {
  const auth = useTradingAuth();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const identity = auth.walletAddress
    ? `${auth.walletAddress.slice(0, 4)}…${auth.walletAddress.slice(-4)}`
    : auth.authenticated
      ? "Your account"
      : "Welcome to Kite";
  async function signOut() {
    setError(null);
    setSigningOut(true);
    try {
      await auth.logout();
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="account-trigger"
        aria-label="Open account menu"
      >
        <span className="account-avatar">
          <UserRound size={19} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="account-trigger-copy">
          <strong>{auth.authenticated ? identity : "Your account"}</strong>
          <small>
            {auth.authenticated ? "Connected" : "Sign in to get started"}
          </small>
        </span>
        <ChevronDown size={13} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="account-dropdown">
        <div className="account-menu-heading">
          <span className="account-avatar">
            <UserRound size={22} />
          </span>
          <div>
            <strong>{identity}</strong>
            <small>
              {auth.authenticated
                ? "Your wallet. Your investments."
                : "A place for your next idea."}
            </small>
          </div>
        </div>
        <DropdownMenuLinkItem render={<Link href="/portfolio" />}>
          <Wallet2 size={17} />
          Portfolio
          <ArrowUpRight size={14} />
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href="/orders" />}>
          <ListOrdered size={17} />
          Activity
          <ArrowUpRight size={14} />
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem
          render={<Link href="/app?filter=saved#all-assets" />}
        >
          <Bookmark size={17} />
          Saved assets
          <ArrowUpRight size={14} />
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/settings" />}>
          <Settings2 size={17} />
          Account & settings
          <ArrowUpRight size={14} />
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href="/terms" />}>
          <FileText size={17} />
          Terms & policies
          <ArrowUpRight size={14} />
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        {error && (
          <p className="account-menu-error" role="alert">
            {error}
          </p>
        )}
        {auth.authenticated ? (
          <DropdownMenuItem
            className="account-signout"
            disabled={signingOut}
            closeOnClick={false}
            onClick={signOut}
          >
            <LogOut size={17} />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuLinkItem
            className="account-signin"
            render={<Link href="/settings" />}
          >
            <UserRound size={17} />
            Sign in / connect wallet
            <ArrowUpRight size={14} />
          </DropdownMenuLinkItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SignInButton() {
  return <AccountMenu />;
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
    <div className="workspace kite-workspace">
      <header className="workspace-header">
        <div className="workspace-header-inner">
          <div className="navigation-core">
            <Brand />
            <div className="navigation-pill">
              <PrimaryNavigation />
            </div>
          </div>
          <div className="workspace-header-actions">
            <button
              className="header-search"
              onClick={() => setSearchOpen(true)}
              aria-label="Search assets"
            >
              <Search size={18} />
              <span>Search</span>
              <kbd>⌘ K</kbd>
            </button>
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="workspace-main">
        <div className="workspace-context">
          <div className="breadcrumb">
            Kite <ChevronRight size={12} />
            <strong>{title}</strong>
          </div>
          <TradingModeSwitch />
        </div>
        {children}
        <footer className="page-footer">
          <span>
            <ShieldCheck size={12} />
            Self-custody, by design
          </span>
          <span>
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
      <nav
        className="bottom-nav kite-bottom-nav"
        aria-label="Mobile navigation"
      >
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={isActive(path, href) ? "active" : ""}
            aria-current={isActive(path, href) ? "page" : undefined}
          >
            <Icon strokeWidth={1.6} />
            {label}
          </Link>
        ))}
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
          Verified issuer catalogs{" "}
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
      {children}
    </div>
  );
}
