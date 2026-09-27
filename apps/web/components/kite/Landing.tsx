"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Layers3,
  Repeat2,
  ShieldCheck,
} from "lucide-react";
import { resolveAllMarketBaskets, type MarketSnapshot } from "@kite/sdk";
import { Brand } from "./Brand";
import { useKite } from "./State";
import { AssetAvatar } from "./MarketUI";
import { PrimaryNavigation } from "./Shell";
import { ThemeToggle } from "./ThemeMode";
import styles from "./Landing.module.css";

const CADENCES = ["daily", "weekly", "monthly"] as const;
export function Landing({
  initialSnapshot,
}: { initialSnapshot?: MarketSnapshot | null } = {}) {
  const { snapshot } = useKite();
  const [cadence, setCadence] = useState<(typeof CADENCES)[number]>("weekly");
  const current = snapshot ?? initialSnapshot;
  const baskets = current?.baskets ?? resolveAllMarketBaskets([]);
  const featured =
    baskets.find((b) => b.available) ??
    baskets.find((b) => b.assets.length > 0);
  const planHref = `/sip?cadence=${cadence}${featured ? `&basket=${encodeURIComponent(featured.id)}` : ""}#new-plan`;
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
            <Link href="/sip" className="btn small landing-open">
              Make a plan <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>
      <main id="main-content" className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>A LITTLE. REGULARLY. YOURS.</p>
            <h1>
              Good ideas
              <br />
              deserve <em>a routine.</em>
            </h1>
            <p>
              Turn the companies you believe in into a basket. Choose your
              amount, set your rhythm, and keep your investments in your own
              wallet.
            </p>
            <div className={styles.actions}>
              <Link className="btn" href={planHref}>
                Build your investing routine{" "}
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/baskets" className="text-link">
                Find your basket <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className={styles.note}>
              <ShieldCheck size={16} aria-hidden="true" />
              Try recurring with devnet test tokens or paper practice. Mainnet
              purchases are available separately.
            </p>
          </div>
          <div className={styles.plan} aria-label="Recurring plan preview">
            <div className={styles.planTop}>
              <span className="eyebrow">YOUR INVESTING RHYTHM</span>
              <Repeat2 size={20} aria-hidden="true" />
            </div>
            <div className={styles.planTitle}>
              <span className={styles.planIcon}>
                <Layers3 size={24} aria-hidden="true" />
              </span>
              <div>
                <h2>{featured?.name ?? "Start with a theme"}</h2>
                <p>
                  {featured
                    ? `${featured.assets.length} individual assets`
                    : "Choose your basket in Kite"}
                </p>
              </div>
            </div>
            <div
              className={styles.cadence}
              role="group"
              aria-label="Preview an investing frequency"
            >
              {CADENCES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={cadence === value}
                  onClick={() => setCadence(value)}
                >
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <div className={styles.schedule}>
              <CalendarDays size={19} aria-hidden="true" />
              <div>
                <strong>
                  {cadence === "daily"
                    ? "Make it a daily habit."
                    : cadence === "weekly"
                      ? "A little room, every week."
                      : "Give your month a plan."}
                </strong>
                <p>You choose the amount and duration in the next step.</p>
              </div>
            </div>
            <div className={styles.constituents}>
              {featured?.assets.length ? (
                featured.assets.slice(0, 4).map(({ asset, weight }) => (
                  <div key={asset.mint}>
                    <AssetAvatar asset={asset} small />
                    <span>{asset.name.replace(/ xStock$/i, "")}</span>
                    <strong>
                      {(weight / 100).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      %
                    </strong>
                  </div>
                ))
              ) : (
                <p>
                  Live issuer allocations appear here when the catalog is
                  available.
                </p>
              )}
            </div>
            <Link href={planHref} className="btn full">
              Set up this rhythm <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <small className={styles.previewCaption}>
              Plan preview · no active subscription
            </small>
          </div>
        </section>
        <section className={styles.how} aria-labelledby="routine-heading">
          <div>
            <p className={styles.kicker}>01 / AN IDEA BECOMES A HABIT</p>
            <h2 id="routine-heading">
              A plan that fits
              <br />
              the way you invest.
            </h2>
            <p>
              Set up a bounded delegation with Solana Subscriptions. Keep
              ownership of your funds and revoke future installments from your
              wallet.
            </p>
          </div>
          <ol>
            {[
              {
                title: "Pick your point of view.",
                text: "Choose a thematic basket or one stock. See exactly what is in the allocation.",
              },
              {
                title: "Choose a comfortable rhythm.",
                text: "Daily, weekly, every two weeks or monthly in paper practice. Onchain test plans use fixed intervals.",
              },
              {
                title: "Review it. Keep control.",
                text: "Approve the amount and duration, follow each receipt, and cancel future collections when you need to.",
              },
            ].map(({ title, text }, index) => (
              <li key={title}>
                <span>0{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.collection} aria-labelledby="themes-heading">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>
                02 / START WITH SOMETHING YOU BELIEVE IN
              </p>
              <h2 id="themes-heading">Big ideas. Clear allocations.</h2>
            </div>
            <Link href="/baskets" className="text-link">
              View the collection <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.themeGrid}>
            {baskets.slice(0, 3).map((basket, index) => (
              <Link
                key={basket.id}
                href={`/basket/${basket.id}`}
                className={styles.theme}
              >
                <span className={styles.themeNumber}>
                  0{index + 1}
                  <ArrowUpRight size={19} aria-hidden="true" />
                </span>
                <h3>{basket.name}</h3>
                <p>{basket.description}</p>
                <div>
                  {basket.assets.slice(0, 4).map(({ asset }) => (
                    <AssetAvatar key={asset.mint} asset={asset} small />
                  ))}
                  <span>
                    {basket.assets.length
                      ? `${basket.assets.length} assets`
                      : "View allocation"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <p className={styles.note}>
            Availability depends on issuer status and current trading routes.
            Missing market data stays unavailable.
          </p>
        </section>
        <section className={styles.creator}>
          <div>
            <p className={styles.kicker}>
              03 / FOR PEOPLE WITH A POINT OF VIEW
            </p>
            <h2>
              Create a basket.
              <br />
              Give it a following.
            </h2>
            <p>
              Build a clear allocation, publish with a creator invite, and share
              a subscription Blink. Follow confirmed volume and recurring
              engagement in your studio.
            </p>
            <Link href="/basket/builder" className="btn secondary">
              Open the creator studio{" "}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.creatorDetails}>
            <div>
              <Check size={18} aria-hidden="true" />
              <span>Private drafts for everyone</span>
            </div>
            <div>
              <Check size={18} aria-hidden="true" />
              <span>Public publishing by invitation</span>
            </div>
            <div>
              <Check size={18} aria-hidden="true" />
              <span>Devnet subscription Blinks</span>
            </div>
            <div>
              <Check size={18} aria-hidden="true" />
              <span>Points from verified mainnet activity</span>
            </div>
          </div>
        </section>
        <section className={styles.cta}>
          <div>
            <p className={styles.kicker}>START AT YOUR OWN PACE</p>
            <h2>
              Your next investment
              <br />
              can become a routine.
            </h2>
          </div>
          <Link href="/sip" className="btn">
            Make your first plan <ArrowUpRight size={18} aria-hidden="true" />
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
            <Link href="/creators">Creators</Link>
          </nav>
        </footer>
      </main>
    </>
  );
}
