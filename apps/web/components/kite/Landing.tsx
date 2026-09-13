"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Globe2,
  Layers3,
  Repeat2,
  ShieldCheck,
} from "lucide-react";
import { Brand, OrbitArt } from "./Brand";
import { useKite } from "./State";
import { useBaskets } from "./useBaskets";
import { WatchRow } from "./MarketUI";
import { BasketMarquee } from "./BasketMarquee";
import { TradingModeSwitch } from "./TradingModeSwitch";

export function Landing() {
  const { snapshot, loading } = useKite();
  const baskets = useBaskets();
  const assets = (snapshot?.assets ?? [])
    .filter((a) => a.priceUsd !== null)
    .slice(0, 2);
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav aria-label="Website navigation">
          <Link href="/markets">Explore markets</Link>
          <Link href="/baskets">Thematic baskets</Link>
          <Link href="/sip">Recurring plans</Link>
        </nav>
        <TradingModeSwitch />
        <Link href="/app" className="btn small">
          Open Kite <ArrowUpRight size={15} />
        </Link>
      </header>
      <main>
        <section className="landing-hero">
          <div>
            <span className="badge lime">
              <span className="status-dot" /> YOUR WORLD, ONCHAIN
            </span>
            <h1>
              Big ideas.
              <br />
              Small beginnings.
              <br />
              <span>Limitless you.</span>
            </h1>
            <p>
              The companies you follow. The future you believe in. Discover
              tokenized equities and thematic baskets on Solana, with ownership
              that stays yours.
            </p>
            <div className="landing-actions">
              <Link href="/app" className="btn">
                Find your next idea <ArrowUpRight size={16} />
              </Link>
              <Link href="/settings" className="text-link">
                Sign in with Privy
              </Link>
            </div>
            <small>
              Start with paper trading. Real market prices. Virtual funds.
            </small>
          </div>
          <div className="landing-art">
            <div className="landing-art-label">
              <span className="eyebrow">THE WORLD IS OPEN</span>
            </div>
            <OrbitArt />
            <div className="landing-live-list">
              {assets.length ? (
                assets.map((a) => <WatchRow key={a.mint} asset={a} />)
              ) : (
                <div style={{ padding: "21px 0" }}>
                  <p className="eyebrow">LIVE MARKET CONNECTION</p>
                  <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    {loading
                      ? "Discovering issuer-listed mainnet assets…"
                      : "Market prices are temporarily unavailable."}
                  </p>
                  <Link
                    href="/markets"
                    className="text-link"
                    style={{ marginTop: 12 }}
                  >
                    Explore the catalog <ArrowRight size={13} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
        <div className="landing-strip">
          <span>
            <ShieldCheck />
            Your keys. Your ownership.
          </span>
          <span>
            <Layers3 />
            Curated thematic baskets
          </span>
          <span>
            <Globe2 />
            Tokenized equities
          </span>
          <span>
            <Repeat2 />
            Build an investing habit
          </span>
        </div>
        <section
          className="landing-section landing-baskets"
          aria-labelledby="featured-baskets-heading"
        >
          <div className="section-head">
            <div>
              <p className="eyebrow" style={{ marginBottom: 13 }}>
                INVEST IN A POINT OF VIEW
              </p>
              <h2 id="featured-baskets-heading">Themes worth exploring.</h2>
              <p className="landing-section-intro">
                Find your perspective. Explore the full collection.
              </p>
            </div>
            <Link className="text-link" href="/baskets">
              All baskets <ArrowUpRight size={15} />
            </Link>
          </div>
          <BasketMarquee baskets={baskets} />
        </section>
        <section className="landing-section" style={{ paddingTop: 15 }}>
          <p className="eyebrow" style={{ marginBottom: 14 }}>
            YOUR NEXT CHAPTER STARTS HERE
          </p>
          <h2>From a spark to a stake.</h2>
          <div className="how-grid">
            <div className="how-item">
              <span>01 / DISCOVER</span>
              <h3>Follow your curiosity.</h3>
              <p>
                Explore issuer-listed xStocks and PreStocks. Look inside each
                basket and get to know what you’re investing in.
              </p>
            </div>
            <div className="how-item">
              <span>02 / PRACTICE</span>
              <h3>Find your footing.</h3>
              <p>
                Try your ideas with virtual funds and live reference prices.
                Your paper portfolio begins with your first decision.
              </p>
            </div>
            <div className="how-item">
              <span>03 / OWN</span>
              <h3>Make it yours.</h3>
              <p>
                Sign in with Privy or connect your wallet. Review a Jupiter
                swap, approve it, and hold the assets in your own wallet.
              </p>
            </div>
          </div>
        </section>
        <section className="landing-cta">
          <div>
            <h2>Your next idea is waiting.</h2>
            <p>
              Explore the market. Build a point of view. Let it take flight.
            </p>
          </div>
          <Link href="/app" className="btn">
            Open your world <ArrowUpRight size={16} />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <p>
          Kite is a self-custody interface for tokenized assets. Issuer
          eligibility and trading restrictions apply. Paper trading is a
          simulation and does not represent actual execution.
        </p>
      </footer>
    </div>
  );
}
