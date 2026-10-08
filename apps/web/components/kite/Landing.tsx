"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Layers3,
  ShieldCheck,
  Wallet2,
} from "lucide-react";
import { resolveAllMarketBaskets, type MarketSnapshot } from "@kite/sdk";
import { Brand } from "./Brand";
import { useKite } from "./State";
import { AssetAvatar } from "./MarketUI";
import { SocialLinks } from "./SocialLinks";
import { LandingRecurring } from "./LandingRecurring";
import { LandingResearch } from "./LandingResearch";
import { LandingNavigation } from "./LandingNavigation";
import { LandingMarket } from "./LandingMarket";
import { LandingSources } from "./LandingSources";
import { PrivacyChoicesButton } from "./PrivacyChoices";
import { useLandingMotion } from "./landing-motion";
import styles from "./Landing.module.css";

const questions = [
  [
    "What am I investing in?",
    "Tokenized securities represent issuer-defined exposure to stocks and other assets. They are not a direct brokerage share purchase. Check the issuer, eligibility, underlying asset and token details before investing. Kite brings that research and the available Solana tokens into one interface.",
  ],
  [
    "What does vaultless mean?",
    "Kite does not use a custodial vault for mainnet stock or basket purchases. You approve transactions with your wallet, and purchased tokens settle to your wallet accounts. Token issuers, trading venues and the network still carry risks.",
  ],
  [
    "Can I automate real-money investments today?",
    "Mainnet recurring investing is not yet available. Wallet SIP/DCA is a separate devnet demonstration: a bounded plan collects test KUSD and mints test stock outputs to your wallet. You can also practice recurring investing in paper mode.",
  ],
  [
    "How does a basket purchase work?",
    "A basket is a set of individual assets with defined allocation weights. Review the constituents, minimum outputs, fees and transaction count before signing. Kite attempts a complete transaction first; larger routes may require an ordered Jito bundle. Availability depends on the full route, and bundle execution is not unconditionally atomic.",
  ],
  [
    "Can I try Kite before connecting a wallet?",
    "Yes. Browse the markets and research, or start with $10,000 in virtual cash and no seeded holdings in paper mode. Paper recurring runs due installments only while the app is open and does not backfill missed intervals. Paper results are not a forecast of real execution.",
  ],
] as const;

export function Landing({
  initialSnapshot,
}: { initialSnapshot?: MarketSnapshot | null } = {}) {
  const { snapshot, loading } = useKite();
  const current = snapshot ?? initialSnapshot ?? null;
  const observedAssets = (current?.assets ?? []).filter(
    (asset) =>
      asset.verified &&
      !asset.tradingHalted &&
      asset.priceUsd != null &&
      Number.isFinite(asset.priceUsd),
  );
  const assets = [...observedAssets]
    .sort((left, right) => {
      const preferred = ["NVDA", "AAPL", "MSFT", "TSLA"];
      const rank = (symbol: string) => {
        const index = preferred.indexOf(symbol);
        return index === -1 ? preferred.length : index;
      };
      return rank(left.underlyingSymbol) - rank(right.underlyingSymbol);
    })
    .slice(0, 4);
  const featured =
    assets.find((asset) => asset.underlyingSymbol === "NVDA") ?? assets[0];
  const baskets = resolveAllMarketBaskets(current?.assets ?? []);
  const basket =
    baskets.find((item) => item.id === "sol-digital-leaders") ?? baskets[0];
  const root = useRef<HTMLDivElement>(null);

  useLandingMotion(root);

  return (
    <div className={styles.site} ref={root}>
      <div className={styles.pageProgress} aria-hidden="true">
        <span data-page-progress />
      </div>
      <LandingNavigation />

      <main id="main-content">
        <section
          className={styles.hero}
          aria-labelledby="landing-title"
          data-hero
        >
          <div className={styles.heroVisual} data-hero-frame>
            <div className={styles.heroMedia} data-hero-media>
              <Image
                src="/images/landing/dollar-abstract.webp"
                alt="Dollar engraving with geometric green lines on a forest-green background"
                fill
                priority
                sizes="(max-width: 760px) 100vw, 68vw"
                className={styles.heroImage}
                data-hero-image
              />
            </div>
            <div className={styles.heroShade} aria-hidden="true" />
          </div>
          <div className={[styles.container, styles.heroContent].join(" ")}>
            <div className={styles.heroCopy}>
              <h1 id="landing-title">
                <span className={styles.heroLine}>
                  <span data-hero-line>The world’s stocks.</span>
                </span>
                <span className={styles.heroLine}>
                  <em data-hero-line>Your own wallet.</em>
                </span>
              </h1>
              <p className={styles.intro} data-hero-intro>
                Research tokenized securities. Invest in stock baskets. Explore
                vaultless automated SIP/DCA—all in one workspace, with your
                investments in your wallet.
              </p>
              <div className={styles.actions}>
                <Link href="/app" className={styles.button}>
                  Explore the markets{" "}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
                <Link href="#automate" className={styles.textLink}>
                  Discover vaultless SIP/DCA{" "}
                  <ArrowDown size={16} aria-hidden="true" />
                </Link>
              </div>
              <div className={styles.heroStatus}>
                <span>
                  <span className={styles.dot} /> Mainnet stock & basket
                  purchases
                </span>
                <span>Automated SIP / DCA · Devnet demo</span>
              </div>
              <p className={styles.heroDetail} data-hero-detail>
                <Wallet2 size={17} strokeWidth={1.5} />
                Your assets. In your wallet. No Kite custodial vault.
              </p>
            </div>
            <Link href="#research" className={styles.heroScroll}>
              <span>Explore the workspace</span>
              <ArrowDown size={17} />
            </Link>
          </div>
        </section>

        <section
          className={`${styles.container} ${styles.researchSection}`}
          id="research"
          aria-labelledby="research-title"
        >
          <div className={styles.research} data-scroll-lock="research">
            <div className={`${styles.sectionCopy} ${styles.storyCopy}`}>
              <h2 id="research-title">
                Conviction starts
                <br />
                with <em>the full picture.</em>
              </h2>
              <p>
                Know the business behind the ticker. Company fundamentals, price
                history, technical indicators, news and events—together in one
                research workspace.
              </p>
              <ul className={styles.checkList}>
                <li>
                  <Check size={16} />
                  Token prices and underlying shares, clearly distinguished
                </li>
                <li>
                  <Check size={16} />
                  Source-backed data, with observation dates
                </li>
                <li>
                  <Check size={16} />
                  Unavailable data stays unavailable
                </li>
              </ul>
              <Link href="/markets" className={styles.textLink}>
                Find your next investment <ArrowRight size={17} />
              </Link>
            </div>
            <div className={styles.storyTrack} data-scroll-track="research">
              <LandingResearch asset={featured} loading={loading} />
            </div>
          </div>
          <LandingMarket assets={assets} snapshot={current} loading={loading} />
        </section>

        <section
          className={styles.basketSection}
          id="baskets"
          aria-labelledby="basket-title"
        >
          <div className={styles.container}>
            <div data-section-sequence="allocation">
              <div className={styles.sectionHeading} data-motion-group>
                <div>
                  <h2 id="basket-title">
                    Several companies.
                    <br />
                    <em>One considered allocation.</em>
                  </h2>
                </div>
                <p>
                  Choose a theme or build your own basket. Review each company
                  and its weight. The individual tokens arrive directly in your
                  wallet.
                </p>
              </div>
              <div className={styles.basketFeature}>
                <div
                  className={styles.allocationPanel}
                  data-sequence-stage
                  data-motion-panel
                  data-motion-layout
                >
                  <div className={styles.panelTop}>
                    <span className={styles.eyebrow}>
                      INSIDE THE ALLOCATION
                    </span>
                    <Layers3 size={19} />
                  </div>
                  <h3>{basket?.name ?? "Kite-curated baskets"}</h3>
                  <p>
                    {basket?.description ??
                      "Explore the complete allocation before investing."}
                  </p>
                  {basket &&
                  basket.assets.length > 0 &&
                  !basket.missingSymbols.length ? (
                    <>
                      <div
                        className={styles.allocationBar}
                        aria-hidden="true"
                        data-allocation-bar
                      >
                        {basket.assets.map((item, index) => (
                          <span
                            key={item.asset.mint}
                            style={{
                              flex: item.weight,
                              opacity: 1 - (index % 5) * 0.15,
                            }}
                          />
                        ))}
                      </div>
                      <div className={styles.allocations} data-motion-group>
                        {basket.assets.map((item) => (
                          <div key={item.asset.mint}>
                            <AssetAvatar asset={item.asset} small />
                            <span>
                              {item.asset.name.replace(/ xStock$/i, "")}
                              <small>{item.asset.symbol}</small>
                            </span>
                            <strong>{(item.weight / 100).toFixed(2)}%</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptyAllocation}>
                      <Layers3 size={30} />
                      <p>
                        {loading
                          ? "Loading constituent allocations…"
                          : "Complete constituent data is unavailable. View the basket to check availability."}
                      </p>
                    </div>
                  )}
                  <div className={styles.panelFoot} data-text-reveal-block>
                    <Wallet2 size={15} />
                    Individual tokens. Direct wallet settlement.
                  </div>
                </div>
                <div
                  className={styles.basketExplanation}
                  data-motion-group="copy"
                >
                  <span className={styles.bigNumber}>2–12</span>
                  <h3>Assets in your custom basket.</h3>
                  <p>
                    You choose the companies and allocation weights. Kite
                    prepares the route and shows you the costs before you sign.
                  </p>
                  <Link href="/basket/builder" className={styles.button}>
                    Build your own basket <ArrowUpRight size={17} />
                  </Link>
                  <small>
                    The asset range is a builder limit. Live execution depends
                    on the complete route.
                  </small>
                </div>
              </div>
            </div>
            <div className={styles.basketGrid} data-motion-group="cards">
              {baskets.slice(0, 3).map((item, index) => (
                <Link
                  href={`/basket/${item.id}`}
                  className={styles.basketTile}
                  key={item.id}
                >
                  <div className={styles.tileTop}>
                    <span>
                      0{index + 1} / {item.category ?? "CURATED"}
                    </span>
                    <ArrowUpRight size={19} />
                  </div>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <div className={styles.tileBottom}>
                    <div>
                      {item.assets.slice(0, 4).map(({ asset }) => (
                        <AssetAvatar key={asset.mint} asset={asset} small />
                      ))}
                    </div>
                    <span>
                      View allocation <ArrowRight size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div className={styles.basketBottom}>
              <p>
                A basket is an allocation of individual assets. It is not a
                synthetic basket token.
              </p>
              <Link href="/baskets" className={styles.textLink}>
                Explore all baskets <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        <section
          className={styles.automateSection}
          id="automate"
          aria-labelledby="automate-title"
          data-recurring-section
        >
          <div className={styles.container} data-recurring-stage>
            <div className={styles.automateHeading}>
              <p className={styles.eyebrow}>VAULTLESS AUTOMATED INVESTING</p>
              <span className={styles.demoBadge}>DEVNET TEST-TOKEN DEMO</span>
            </div>
            <div className={styles.automateGrid} data-scroll-lock="recurring">
              <div className={`${styles.sectionCopy} ${styles.storyCopy}`}>
                <h2 id="automate-title">
                  Build a routine.
                  <br />
                  <em>Keep the control.</em>
                </h2>
                <p>
                  A systematic investment plan (SIP) puts dollar-cost averaging
                  (DCA) on a schedule. Choose an amount and cadence, authorize a
                  bounded plan, and let due test-token installments run.
                </p>
                <p className={styles.automateLead}>
                  Your funds stay in your wallet until an installment is due. No
                  upfront deposit into a Kite vault.
                </p>
                <ul className={styles.checkList}>
                  <li>
                    <Check size={16} />
                    You set the amount, allocation and duration
                  </li>
                  <li>
                    <Check size={16} />
                    Daily, weekly, biweekly or every 30 days
                  </li>
                  <li>
                    <Check size={16} />
                    Bounded spending authority. Close your plan in Kite.
                  </li>
                </ul>
                <Link href="/sip#new-plan" className={styles.limeButton}>
                  Try the recurring demo <ArrowUpRight size={17} />
                </Link>
                <p className={styles.networkNote}>
                  Wallet recurring uses devnet test KUSD and test stock outputs.
                  Mainnet recurring investing is not yet available.
                </p>
              </div>
              <div className={styles.storyTrack} data-scroll-track="recurring">
                <LandingRecurring />
              </div>
            </div>
          </div>
        </section>

        <section
          className={`${styles.container} ${styles.howSection}`}
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div data-section-sequence="ownership">
            <div className={styles.sectionHeading} data-motion-group>
              <div>
                <p className={styles.eyebrow}>THE OWNERSHIP IS YOURS</p>
                <h2 id="how-title">
                  A clearer path
                  <br />
                  from research to <em>investing.</em>
                </h2>
              </div>
              <Link href="/app" className={styles.textLink}>
                Take a look inside Kite <ArrowUpRight size={17} />
              </Link>
            </div>
            <div
              className={styles.steps}
              data-motion-group
              data-sequence-owned
              data-sequence-stage
            >
              {[
                {
                  icon: BookOpen,
                  title: "Understand what you buy",
                  text: "Research the company, check the issuer and compare the token with its underlying share.",
                },
                {
                  icon: ShieldCheck,
                  title: "Review. Then authorize.",
                  text: "See funding, minimum outputs, fees and transaction count. Your wallet approves the purchase.",
                },
                {
                  icon: Wallet2,
                  title: "Keep your assets close",
                  text: "Tokens settle to your wallet. Track balances, available market values and your locally recorded orders.",
                },
              ].map(({ icon: Icon, title, text }, index) => (
                <article key={title}>
                  <div>
                    <Icon size={27} strokeWidth={1.4} />
                    <span>0{index + 1}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
          <div className={styles.paperCallout} data-motion-panel>
            <div>
              <span className={styles.paperIcon}>
                <Layers3 size={25} />
              </span>
              <div>
                <h3>Your first investment can be a practice run.</h3>
                <p>
                  Start with $10,000 in virtual cash. Learn the workspace before
                  using real funds.
                </p>
              </div>
            </div>
            <Link href="/app" className={styles.textLink}>
              Explore paper mode <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
        <LandingSources />
        <section
          className={`${styles.container} ${styles.faq}`}
          aria-labelledby="faq-title"
        >
          <div data-motion-group="copy">
            <p className={styles.eyebrow}>A FEW THINGS TO KNOW</p>
            <h2 id="faq-title">
              Clarity comes
              <br />
              <em>before capital.</em>
            </h2>
            <p>
              Understand the product, the networks and the risks before your
              first investment.
            </p>
          </div>
          <div
            className={styles.questions}
            data-motion-group
            data-motion-layout
          >
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className={styles.footer} aria-label="Kite">
        <div className={styles.container}>
          <div className={styles.footerCta}>
            <div>
              <h2>
                A better-informed next move.
                <br />
                <em>Starts here.</em>
              </h2>
              <p>Research freely. Practice first. Invest from your wallet.</p>
            </div>
            <Link href="/app" className={styles.limeButton}>
              Open Kite <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.footerTop}>
            <div>
              <Brand />
              <p>
                Tokenized securities.
                <br />
                Your wallet. A considered approach.
              </p>
            </div>
            <nav aria-label="Kite product">
              <Link href="/markets">Markets</Link>
              <Link href="/baskets">Baskets</Link>
              <Link href="/sip">Recurring demo</Link>
              <Link href="/portfolio">Portfolio</Link>
            </nav>
            <div className={styles.footerSocial}>
              <SocialLinks />
            </div>
          </div>
          <div className={styles.footerBottom}>
            <p>
              Kite is a self-custody interface. Issuer eligibility and trading
              restrictions apply. Investments carry issuer, market, network and
              execution risk.
            </p>
            <nav aria-label="Legal and data controls">
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/settings">Data controls</Link>
              <PrivacyChoicesButton />
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
