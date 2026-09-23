"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  Layers3,
  ShieldCheck,
  Wallet2,
} from "lucide-react";
import { Brand } from "./Brand";
import { useKite } from "./State";
import { useMemo } from "react";
import {
  resolveAllMarketBaskets,
  type MarketAsset,
  type MarketSnapshot,
} from "@kite/sdk";
import { useBaskets } from "./useBaskets";
import { AssetAvatar, Change, money } from "./MarketUI";
import { PrimaryNavigation } from "./Shell";
import { ThemeToggle } from "./ThemeMode";
import styles from "./Landing.module.css";

function curatedAsset(
  mint: string,
  symbol: string,
  underlyingSymbol: string,
  name: string,
  priceUsd: number,
  change24hPct: number,
): MarketAsset {
  return {
    mint,
    symbol,
    underlyingSymbol,
    name,
    issuer: "xstocks",
    kind: "equity",
    verified: true,
    tradingHalted: false,
    priceUsd,
    change24hPct,
    decimals: 8,
    logoUrl: null,
    volume24hUsd: null,
    liquidityUsd: null,
    marketCapUsd: null,
    updatedAt: null,
    priceObservedAt: null,
    sourceUrl: "https://api.xstocks.fi/api/v2/public/assets",
  };
}

const CURATED_LANDING_ASSETS: MarketAsset[] = [
  curatedAsset(
    "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    "NVDAx",
    "NVDA",
    "NVIDIA",
    120.85,
    2.45,
  ),
  curatedAsset(
    "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    "AAPLx",
    "AAPL",
    "Apple",
    228.2,
    0.85,
  ),
  curatedAsset(
    "XspE8mwXBymgupnTUpqdBiCYNmHQ5fUYWBio4n6pW7b",
    "MSFTx",
    "MSFT",
    "Microsoft",
    432.1,
    1.15,
  ),
  curatedAsset(
    "XsHtf5EcmSttHupb4Aeo6LUtReFnsw5sNoFspCPpzqC",
    "AMZNx",
    "AMZN",
    "Amazon",
    186.4,
    -0.42,
  ),
];

const LANDING_FALLBACK_ASSETS: MarketAsset[] = [
  CURATED_LANDING_ASSETS[1], // AAPLx
  CURATED_LANDING_ASSETS[2], // MSFTx
  CURATED_LANDING_ASSETS[0], // NVDAx
  CURATED_LANDING_ASSETS[3], // AMZNx
  curatedAsset(
    "XsGGvdc8bLSm5tYrskoxepGEdskUXGsxWrqdcBCmF5v",
    "GOOGLx",
    "GOOGL",
    "Alphabet",
    165.0,
    0.5,
  ),
  curatedAsset(
    "XsvPaaDM1tempmjrhcTCvdBNEdkDuhbTCadqh5UdZXJ",
    "METAx",
    "META",
    "Meta Platforms",
    510.0,
    1.2,
  ),
  curatedAsset(
    "XsToNmecKL8vgadpHsmbnumepStCPCPgtbcuBHMpZzp",
    "TSLAx",
    "TSLA",
    "Tesla",
    240.0,
    -1.1,
  ),
];

export function Landing({
  initialSnapshot,
}: {
  initialSnapshot?: MarketSnapshot | null;
} = {}) {
  const { snapshot, loading } = useKite();
  const currentSnapshot = snapshot ?? initialSnapshot ?? null;
  const liveAssets = (currentSnapshot?.assets ?? [])
    .filter((asset) => asset.priceUsd != null && !asset.tradingHalted)
    .slice(0, 4);
  const assets = liveAssets.length >= 4 ? liveAssets : CURATED_LANDING_ASSETS;
  const featured = assets[0];
  const baskets = useBaskets();
  const liveBasket = baskets.find((item) => item.assets.length >= 3);
  const fallbackBaskets = useMemo(
    () => resolveAllMarketBaskets(LANDING_FALLBACK_ASSETS),
    [],
  );
  const basket =
    liveBasket ??
    (fallbackBaskets[0]
      ? {
          id: fallbackBaskets[0].id,
          name: fallbackBaskets[0].name,
          description: fallbackBaskets[0].description,
          assets: fallbackBaskets[0].assets.map((a) => a.asset),
          available: true,
          source: fallbackBaskets[0],
        }
      : undefined);
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
      <main className={styles.page}>
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
              A clearer view of the companies you believe in. Discover tokenized
              stocks, explore ideas, and bring your investments together on
              Solana.
            </p>
            <div className={styles.actions}>
              <Link href="/app" className="btn">
                Explore the markets <ArrowUpRight size={16} />
              </Link>
              <Link href="/baskets" className="text-link">
                Find your theme <ArrowRight size={15} />
              </Link>
            </div>
            <div className={styles.heroNote}>
              <ShieldCheck size={16} /> Your assets stay in your wallet.
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
            <Layers3 /> Ideas, brought together
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
        <section className={styles.cta}>
          <span className={styles.kicker}>FOLLOW YOUR CURIOSITY</span>
          <h2>Your next idea is waiting.</h2>
          <p>Find the companies and themes that mean something to you.</p>
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
          <Link href="/privacy">
            Data &amp; privacy <ArrowUpRight size={13} />
          </Link>
        </footer>
      </main>
    </>
  );
}
