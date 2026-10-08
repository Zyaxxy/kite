"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeMode";
import { gsap, ScrollTrigger, useGSAP } from "./landing-motion";
import styles from "./Landing.module.css";

const navigation = [
  ["Research", "#research"],
  ["Baskets", "#baskets"],
  ["Automated investing", "#automate"],
  ["How Kite works", "#how-it-works"],
] as const;

export function LandingNavigation() {
  const header = useRef<HTMLElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [floating, setFloating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useGSAP(
    () => {
      const frame = dock.current;
      const shell = header.current;
      if (!frame || !shell) return;
      const surface = frame.querySelector<HTMLElement>("[data-nav-surface]")!;
      const brand = frame.querySelector<HTMLElement>(".kite-brand")!;
      const wordmark = brand.querySelector<HTMLElement>(":scope > span")!;
      const links = frame.querySelector<HTMLElement>("nav")!;
      const actions = frame.querySelector<HTMLElement>("[data-nav-actions]")!;
      const theme = frame.querySelector<HTMLElement>("[data-nav-theme]")!;
      const themeControl = theme.querySelector<HTMLElement>(".theme-toggle")!;
      const primary = frame.querySelector<HTMLAnchorElement>("[data-nav-primary]")!;
      frame.dataset.navEnhanced = "true";
      const media = gsap.matchMedia();
      media.add(
        { reduced: "(prefers-reduced-motion: reduce)", animated: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          const padding = () => innerWidth <= 760 ? 24 : innerWidth <= 1100 ? 36 : 56;
          const actionGap = () => parseFloat(getComputedStyle(actions).columnGap) || 0;
          const islandWidth = () => {
            const menuWidth = menuButton.current?.offsetWidth ?? 0;
            const compactActions = primary.offsetWidth + (menuWidth ? menuWidth + actionGap() : 0);
            return Math.min(innerWidth - 32, 30 + links.offsetWidth + compactActions + (links.offsetWidth ? 32 : 16) + 24);
          };
          const timeline = gsap.timeline({ paused: true, defaults: { duration: 1, ease: "none" } });
          timeline
            .fromTo(frame, { width: () => Math.min(innerWidth, 1440), xPercent: -50, x: 0, y: 0 }, { width: islandWidth, y: 16 }, 0)
            .fromTo(surface, { paddingLeft: padding, paddingRight: padding, paddingTop: () => innerWidth <= 760 ? 14 : 18, paddingBottom: () => innerWidth <= 760 ? 14 : 18, columnGap: () => innerWidth <= 1100 ? 12 : 24, minHeight: () => innerWidth <= 760 ? 76 : 89, borderRadius: 0, "--nav-surface-opacity": 0 }, { paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, columnGap: 16, minHeight: 60, borderRadius: 12, "--nav-surface-opacity": 1 }, 0)
            .fromTo(wordmark, { width: () => wordmark.scrollWidth, opacity: 1 }, { width: 0, opacity: 0 }, 0)
            .fromTo(brand, { gap: 8 }, { gap: 0 }, 0)
            .fromTo(theme, { width: () => themeControl.offsetWidth, marginRight: 0 }, { width: 0, marginRight: () => themeControl.offsetWidth ? -actionGap() : 0 }, 0)
            .fromTo(theme, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 0.1);
          const syncThemeFocus = (concealed: boolean) => {
            if (concealed && !theme.inert && theme.contains(document.activeElement)) {
              primary.focus({ preventScroll: true });
            }
            theme.inert = concealed;
          };
          const reduced = Boolean(context.conditions?.reduced);
          const trigger = ScrollTrigger.create({
            id: "kite-navigation",
            start: 0,
            end: 180,
            ...(reduced ? {} : { animation: timeline, scrub: 0.2 }),
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              setFloating(self.progress >= 0.999);
              if (reduced) timeline.progress(window.scrollY > 90 ? 1 : 0);
              syncThemeFocus(reduced ? window.scrollY > 90 : self.progress >= 0.4);
            },
            onRefresh: (self) => {
              if (reduced) timeline.progress(window.scrollY > 90 ? 1 : 0);
              syncThemeFocus(reduced ? window.scrollY > 90 : self.progress >= 0.4);
            },
          });
          if (reduced) timeline.progress(window.scrollY > 90 ? 1 : 0);
          let active = true;
          void document.fonts.ready.then(() => { if (active) trigger.refresh(); });
          return () => { active = false; theme.inert = false; };
        },
        dock,
      );
      return () => {
        media.revert();
        delete frame.dataset.navEnhanced;
      };
    },
    { scope: header },
  );

  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !dock.current?.contains(event.target))
        setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    const desktop = window.matchMedia("(min-width: 901px)");
    const resize = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    desktop.addEventListener("change", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      desktop.removeEventListener("change", resize);
    };
  }, [menuOpen]);

  return (
    <header ref={header} className={styles.header} data-landing-header>
      <div className={styles.headerInner}>
        <div ref={dock} className={styles.headerDock} data-floating={floating}>
          <div className={styles.navSurface} data-nav-surface>
            <Brand />
            <nav className={styles.desktopNav} aria-label="Landing navigation">
              {navigation.map(([label, href]) => (
                <Link href={href} key={href}>
                  {label}
                </Link>
              ))}
            </nav>
            <div className={styles.headerActions} data-nav-actions>
              <div className={styles.navTheme} data-nav-theme>
                <ThemeToggle />
              </div>
              <Link href="/app" className={styles.button} data-nav-primary>
                Open Kite <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              <button
                ref={menuButton}
                className={styles.menuButton}
                aria-label={menuOpen ? "Close navigation" : "Open navigation"}
                aria-expanded={menuOpen}
                aria-controls="landing-mobile-nav"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
          {menuOpen && (
            <nav
              id="landing-mobile-nav"
              className={styles.mobileNav}
              aria-label="Mobile landing navigation"
            >
              {navigation.map(([label, href]) => (
                <Link key={href} href={href} onClick={() => setMenuOpen(false)}>
                  {label}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              ))}
              <div className={styles.mobileTheme}>
                <span>Appearance</span>
                <ThemeToggle />
              </div>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
