"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Repeat2,
  Check,
  Layers3,
  ShieldCheck,
  Wallet2,
} from "lucide-react";
import { Brand } from "./Brand";
import { useKite } from "./State";
import { resolveAllMarketBaskets, type MarketSnapshot } from "@kite/sdk";
import { useBaskets } from "./useBaskets";
import { AssetAvatar, Change, money } from "./MarketUI";
import { PrimaryNavigation } from "./Shell";
import { ThemeToggle } from "./ThemeMode";
import styles from "./Landing.module.css";

export function Landing({
  initialSnapshot,
}: {
  initialSnapshot?: MarketSnapshot | null;
} = {}) {
  const { snapshot, loading } = useKite();
  const currentSnapshot = snapshot ?? initialSnapshot ?? null;
  const assets = (currentSnapshot?.assets ?? [])
    .filter(
      (asset) =>
        asset.verified && asset.priceUsd != null && !asset.tradingHalted,
    )
    .slice(0, 4);
  const featured = assets[0];
  const allBaskets = useBaskets();
  const serverBaskets = resolveAllMarketBaskets(
    currentSnapshot?.assets ?? [],
  ).map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    assets: b.assets.map((a) => a.asset),
    available: b.available,
    source: b,
  }));
  const baskets = allBaskets.some((item) => item.assets.length)
    ? allBaskets
    : serverBaskets;
  const basket =
    baskets.find((item) => item.available) ??
    baskets.find((item) => item.assets.length);
  return (
    <>
      <header className="workspace-header landing-nav-header">
        <div className="workspace-header-inner">
          <div className="navigation-core">
            <Brand />
            <div className="navigation-pill">
              <PrimaryNavigation landing />
            </div>
          </div>
          <div className="landing-nav-actions">
            <ThemeToggle />
            <Link href="/app" className="btn small landing-open">
              Open Kite <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
      </header>
      <main id="main-content" className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>
              <span /> YOUR WORLD, ONCHAIN
            </p>
            <h1>
              Your ideas.
              <br />
              Your next move.
              <br />
              <em>Your Kite.</em>
            </h1>
            <p>
              Research a company. Put a basket together. Make your next move
              from your own wallet. Explore tokenized stocks, follow your
              portfolio, and practice an investing routine in one place.
            </p>
            <div className={styles.actions}>
              <Link href="/app" className="btn">
                Find your next investment{" "}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              <Link href="/baskets" className="text-link">
                Explore baskets <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
            <div className={styles.heroNote}>
              <ShieldCheck size={16} aria-hidden="true" /> Mainnet spot
              purchases. Self-custody by design.
            </div>
          </div>
          <div
            className={styles.product}
            aria-label="Preview of current Kite market data"
          >
            <div className={styles.productTop}>
              <Brand />
              <span>
                <span className="status-dot" /> MARKET SNAPSHOT
              </span>
            </div>
            <div className={styles.productHeading}>
              <div>
                <small>YOUR NEXT IDEA</small>
                <h2>A world to explore.</h2>
              </div>
              <BookOpen size={22} />
            </div>
            {featured ? (
              <Link
                href={`/stock/${featured.mint}`}
                className={styles.featured}
              >
                <div className={styles.featuredName}>
                  <AssetAvatar asset={featured} />
                  <div>
                    <strong>{featured.name.replace(/ xStock$/i, "")}</strong>
                    <small>{featured.symbol} · Token price</small>
                  </div>
                  <ArrowUpRight size={18} />
                </div>
                <div className={styles.featuredPrice}>
                  <strong>{money(featured.priceUsd)}</strong>
                  <span>
                    <Change value={featured.change24hPct} /> <small>24h</small>
                  </span>
                </div>
                <div className={styles.priceCaption}>
                  Latest available market price <ArrowRight size={15} />
                </div>
              </Link>
            ) : (
              <div className={styles.unavailable} role="status">
                <BookOpen size={28} />
                <strong>
                  {loading
                    ? "Connecting to the markets…"
                    : "Your research starts here."}
                </strong>
                <p>
                  {loading
                    ? "Loading issuer-listed companies and observed prices."
                    : "Live prices are temporarily unavailable. Explore the issuer catalog in Kite."}
                </p>
              </div>
            )}
            <div className={styles.marketList}>
              {assets.slice(1).map((asset) => (
                <Link key={asset.mint} href={`/stock/${asset.mint}`}>
                  <AssetAvatar asset={asset} small />
                  <div>
                    <strong>{asset.name.replace(/ xStock$/i, "")}</strong>
                    <small>{asset.symbol}</small>
                  </div>
                  <span>
                    {money(asset.priceUsd)}
                    <small>
                      <Change value={asset.change24hPct} />
                    </small>
                  </span>
                </Link>
              ))}
            </div>
            <div className={styles.productBottom}>
              <ShieldCheck size={14} /> Issuer-listed assets. Observed prices.
            </div>
          </div>
        </section>
        <div className={styles.strip}>
          <span>
            <Wallet2 /> Self-custody on Solana
          </span>
          <span>
            <BookOpen /> Research before you invest
          </span>
          <span>
            <Layers3 aria-hidden="true" /> Stocks and thematic baskets
          </span>
        </div>
        <section className={styles.research}>
          <div>
            <p className={styles.kicker}>01 / GET THE FULL PICTURE</p>
            <h2>
              Go beyond
              <br />
              the ticker.
            </h2>
            <p>
              Get to know the company behind your next idea. Bring price
              history, fundamentals, headlines, and corporate events into one
              view.
            </p>
            <Link href="/app" className="text-link">
              Find a company <ArrowRight size={16} />
            </Link>
          </div>
          <div className={styles.researchTools}>
            {[
              {
                icon: BookOpen,
                title: "Understand the business",
                text: "Company profiles, revenue, earnings, and financial history.",
              },
              {
                icon: CalendarDays,
                title: "Follow what matters",
                text: "Company news, dividends, splits, and upcoming events.",
              },
              {
                icon: Layers3,
                title: "See more of the market",
                text: "Explore xStocks, PreStocks, and Backpack’s securities catalog.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <span>
                  <Icon size={22} />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
                <ArrowUpRight size={16} />
              </div>
            ))}
          </div>
        </section>
        <section className={styles.themes}>
          <div className={styles.allocation}>
            <div className={styles.allocationTitle}>
              <span className="eyebrow">INSIDE A KITE BASKET</span>
              <Layers3 size={20} />
            </div>
            <h3>{basket?.name ?? "An idea, shared across companies."}</h3>
            <p>Individual assets. One clear allocation.</p>
            {basket?.assets.length ? (
              <>
                <div className={styles.allocationBar} aria-hidden="true">
                  {basket.source.assets.map((item, index) => (
                    <span
                      key={item.asset.mint}
                      style={{
                        flex: item.weight,
                        opacity: 1 - (index % 5) * 0.13,
                      }}
                    />
                  ))}
                </div>
                <div className={styles.allocationRows}>
                  {basket.source.assets.slice(0, 5).map((item) => (
                    <div key={item.asset.mint}>
                      <AssetAvatar asset={item.asset} small />
                      <span>{item.asset.symbol}</span>
                      <strong>
                        {(item.weight / 100).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                        %
                      </strong>
                    </div>
                  ))}
                  {basket.assets.length > 5 && (
                    <small>
                      + {basket.assets.length - 5} more assets in the full
                      allocation
                    </small>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.allocationEmpty}>
                <Layers3 size={32} />
                <p>
                  Explore each theme to see its constituent companies and
                  weights.
                </p>
              </div>
            )}
            <div className={styles.allocationFoot}>
              <Check size={15} /> Delivered as individual tokens to your wallet
            </div>
          </div>
          <div className={styles.themeCopy}>
            <p className={styles.kicker}>02 / INVEST IN A POINT OF VIEW</p>
            <h2>
              Big ideas.
              <br />
              Thoughtful baskets.
            </h2>
            <p>
              From the next wave of technology to everyday essentials. Look
              inside a theme, understand its companies, and review the complete
              allocation before investing.
            </p>
            <Link href="/baskets" className="btn">
              Explore the collection <ArrowUpRight size={16} />
            </Link>
            <small>
              Availability depends on each asset and the complete trading route.
            </small>
          </div>
        </section>
        <section className={styles.showcase} aria-labelledby="showcase-title">
          <div className={styles.showcaseHeading}>
            <div>
              <p className={styles.kicker}>FIND YOUR POINT OF VIEW</p>
              <h2 id="showcase-title">A theme for your next idea.</h2>
            </div>
            <Link href="/baskets" className="text-link">
              All baskets <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.marquee} aria-label="Available basket themes">
            <div className={styles.marqueeTrack}>
              {[0, 1].map((copy) => (
                <div
                  key={copy}
                  className={styles.marqueeGroup}
                  aria-hidden={copy === 1 ? true : undefined}
                >
                  {baskets.map((item) => (
                    <Link
                      key={item.id}
                      href={`/basket/${item.id}`}
                      prefetch={false}
                      tabIndex={copy === 1 ? -1 : undefined}
                      className={styles.themeTile}
                    >
                      <span className={styles.tileCategory}>
                        {item.source.category}
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </span>
                      <h3>{item.name}</h3>
                      <div className={styles.tileAssets}>
                        {item.assets.slice(0, 4).map((asset) => (
                          <AssetAvatar key={asset.mint} asset={asset} small />
                        ))}
                        <span>
                          {item.assets.length
                            ? `${item.assets.length} assets`
                            : "View allocation"}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className={styles.showcaseNote}>
            Themes describe an allocation. Your order review confirms live
            availability, a single transaction or Jito bundle, and every fee.
          </p>
        </section>
        <section className={styles.ownership}>
          <div>
            <p className={styles.kicker}>03 / KEEP IT YOURS</p>
            <h2>
              A clearer portfolio.
              <br />A wallet you control.
            </h2>
            <p>
              Bring your holdings and activity together. Review every trade in
              your own wallet and see where each investment takes you.
            </p>
            <Link href="/portfolio" className="text-link">
              Your portfolio on Kite <ArrowRight size={16} />
            </Link>
          </div>
          <div
            className={styles.walletDiagram}
            aria-label="Investments are delivered directly to your own wallet"
          >
            <div>
              <Layers3 size={24} />
              <span>Your selected assets</span>
            </div>
            <span className={styles.walletArrow}>
              <ArrowRight size={28} />
            </span>
            <div>
              <Wallet2 size={28} />
              <span>Your Solana wallet</span>
              <small>You hold the keys</small>
            </div>
          </div>
        </section>
        <section className={styles.practice} aria-labelledby="practice-title">
          <div>
            <p className={styles.kicker}>04 / FIND YOUR RHYTHM</p>
            <h2 id="practice-title">Start with a little practice.</h2>
            <p>
              Try ideas with $10,000 in virtual cash and live reference prices.
              Set a paper schedule, or explore bounded wallet delegations with
              devnet test tokens.
            </p>
          </div>
          <div className={styles.practiceLinks}>
            <Link href="/portfolio">
              <Wallet2 size={22} aria-hidden="true" />
              <span>
                <strong>A place to learn</strong>
                <small>Paper orders and your recorded results</small>
              </span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/sip">
              <Repeat2 size={22} aria-hidden="true" />
              <span>
                <strong>An investing routine</strong>
                <small>
                  Daily, weekly, biweekly or fixed 30-day test plans
                </small>
              </span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <p>
              Wallet recurring is a separate devnet demonstration. It does not
              buy mainnet stocks.
            </p>
          </div>
        </section>
        <section className={styles.cta}>
          <span className={styles.kicker}>FOLLOW YOUR CURIOSITY</span>
          <h2>Your next idea is waiting.</h2>
          <p>
            From your first piece of research to your next wallet-approved
            purchase.
          </p>
          <Link href="/app" className="btn">
            Start exploring <ArrowUpRight size={17} />
          </Link>
        </section>
        <footer className={styles.footer}>
          <Brand />
          <p>
            Kite is a self-custody interface for tokenized assets.
            <br />
            Issuer eligibility and trading restrictions apply.
          </p>
          <nav aria-label="Footer">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/creators">Creator studio</Link>
          </nav>
        </footer>
      </main>
    </>
  );
}
