"use client";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "kite.privacy.v1";
const DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "";
const knownPaths = new Set([
  "/",
  "/landing",
  "/app",
  "/markets",
  "/baskets",
  "/sip",
  "/portfolio",
  "/watchlist",
  "/orders",
  "/settings",
  "/privacy",
  "/terms",
]);
function category(path: string) {
  return knownPaths.has(path)
    ? path
    : path.startsWith("/stock/")
      ? "/stock/detail"
      : path.startsWith("/basket/")
        ? "/basket/detail"
        : "/not-found";
}
function privacySignal() {
  return (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}

export function PrivacyChoices() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    const restore = () => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
        if (
          saved &&
          typeof saved === "object" &&
          "analytics" in saved &&
          typeof saved.analytics === "boolean" &&
          "expiresAt" in saved &&
          typeof saved.expiresAt === "number" &&
          saved.expiresAt > Date.now()
        ) {
          setChoice(saved.analytics);
          setVisible(false);
        } else {
          setChoice(null);
          setVisible(true);
        }
      } catch {
        setChoice(null);
        setVisible(true);
      }
    };
    restore();
    window.addEventListener("storage", restore);
    return () => window.removeEventListener("storage", restore);
  }, []);
  const record = useCallback(
    (name: string, props?: Record<string, string | number>) => {
      if (
        !choice ||
        !DOMAIN ||
        DOMAIN !== window.location.hostname ||
        privacySignal()
      )
        return;
      // Only known route categories are sent. No wallet, order, search, referrer or form data.
      void fetch("https://plausible.io/api/event", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        keepalive: true,
        body: JSON.stringify({
          name,
          domain: DOMAIN,
          url: `https://${DOMAIN}${category(pathname)}`,
          ...(props ? { props, interactive: false } : {}),
        }),
      }).catch(() => {});
    },
    [choice, pathname],
  );
  useEffect(() => {
    if (!choice) {
      lastPage.current = null;
      return;
    }
    if (lastPage.current !== pathname) {
      record("pageview");
      lastPage.current = pathname;
    }
  }, [choice, pathname, record]);
  useReportWebVitals((metric) =>
    record("Web vital", {
      metric: metric.name,
      value: Math.round(metric.value * 1000) / 1000,
      rating: metric.rating,
    }),
  );
  const save = (analytics: boolean) => {
    setChoice(analytics);
    setVisible(false);
    setSaveError(false);
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ analytics, expiresAt: Date.now() + 180 * 86_400_000 }),
      );
    } catch {
      setSaveError(true);
    }
  };
  return (
    <>
      <footer className="site-footer" aria-label="Data and security">
        <div className="footer-security">
          <span className="footer-security-icon">
            <ShieldCheck size={20} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div>
            <h2>Data & security</h2>
            <p>Your wallet stays yours. You decide what to share.</p>
          </div>
        </div>
        <nav className="footer-links" aria-label="Privacy and account links">
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/settings">
            Data controls <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
          <button type="button" onClick={() => setVisible(true)}>
            <SlidersHorizontal size={14} aria-hidden="true" /> Privacy choices
          </button>
        </nav>
        {saveError && (
          <p className="privacy-save-error" role="status">
            Your choice applies for this visit; device storage is unavailable.
          </p>
        )}
      </footer>
      {visible && (
        <section className="privacy-banner" aria-labelledby="privacy-title">
          <div>
            <h2 id="privacy-title">
              <ShieldCheck size={18} aria-hidden="true" /> Your data. Your
              choice.
            </h2>
            <p>
              Essential storage keeps your preferences and sign-in working.{" "}
              {DOMAIN
                ? "Usage analytics stay off unless you opt in."
                : "Only essential storage is used on this deployment."}{" "}
              <Link href="/privacy">Read the privacy policy</Link>.
            </p>
          </div>
          <div className="privacy-actions">
            <button className="btn small secondary" onClick={() => save(false)}>
              Essential only
            </button>
            {DOMAIN && (
              <button className="btn small" onClick={() => save(true)}>
                Allow analytics
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
