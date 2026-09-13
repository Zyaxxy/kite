"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { BasketCard, type BasketDisplay } from "./MarketUI";

// One row → steady movement → identical repeat boundary. Interaction pauses in place.
const MOTION = { pixelsPerSecond: 32, resumeDelayMs: 1600, maxFrameMs: 64 };

export function BasketMarquee({ baskets }: { baskets: BasketDisplay[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const originalsRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const loop = !reducedMotion && baskets.length > 1;
  const basketKey = baskets.map((basket) => basket.id).join(",");

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const originals = originalsRef.current;
    const copy = copyRef.current;
    if (!loop || !viewport || !originals || !copy) return;

    let period = 0;
    let position = viewport.scrollLeft;
    let previousTime = 0;
    let visible = false;
    let hovered = false;
    let touching = false;
    let focused = viewport.contains(document.activeElement);
    let resumeAt = 0;
    let frame = 0;

    const measure = () => {
      // Include the gap between groups; scrollWidth / 2 would drift at each wrap.
      period = copy.offsetLeft - originals.offsetLeft;
    };
    const resize = new ResizeObserver(measure);
    resize.observe(viewport);
    resize.observe(originals);
    measure();
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      previousTime = 0;
      wake();
    });
    intersection.observe(viewport);

    const delayResume = () => {
      resumeAt = performance.now() + MOTION.resumeDelayMs;
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType === "mouse") hovered = true;
    };
    const leave = () => {
      hovered = false;
    };
    const down = () => {
      touching = true;
    };
    const up = () => {
      touching = false;
      delayResume();
    };
    const focus = (event: FocusEvent) => {
      focused = true;
      const target =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLAnchorElement>(".basket-card")
          : null;
      if (!target) return;
      // Do not move a pointer target between pointerdown and click.
      if (!target.matches(":focus-visible")) return;
      if (copy.contains(target) && period > 0) {
        // Keyboard or programmatic focus on a copy transfers to its accessible original.
        const index = [...copy.querySelectorAll(".basket-card")].indexOf(
          target,
        );
        viewport.scrollLeft %= period;
        originals
          .querySelectorAll<HTMLAnchorElement>(".basket-card")
          [index]?.focus({ preventScroll: true });
      } else {
        target.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
      }
    };
    const blur = (event: FocusEvent) => {
      focused =
        event.relatedTarget instanceof Node &&
        viewport.contains(event.relatedTarget);
      delayResume();
    };
    viewport.addEventListener("pointerenter", enter);
    viewport.addEventListener("pointerleave", leave);
    viewport.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    viewport.addEventListener("wheel", delayResume, { passive: true });
    viewport.addEventListener("focusin", focus);
    viewport.addEventListener("focusout", blur);

    function wake() {
      if (!frame && visible && !document.hidden && !paused)
        frame = requestAnimationFrame(tick);
    }
    const tick = (time: number) => {
      frame = 0;
      if (!visible || document.hidden || paused) {
        previousTime = 0;
        return;
      }
      const elapsed = previousTime
        ? Math.min(time - previousTime, MOTION.maxFrameMs)
        : 0;
      previousTime = time;
      if (
        visible &&
        !document.hidden &&
        !paused &&
        !hovered &&
        !touching &&
        !focused &&
        time >= resumeAt &&
        period > 0
      ) {
        position =
          (position + (elapsed * MOTION.pixelsPerSecond) / 1000) % period;
        viewport.scrollLeft = position;
      } else {
        // Keep fractional movement between frames; only adopt actual scroll on interruption.
        position = viewport.scrollLeft;
      }
      frame = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", wake);
      viewport.removeEventListener("pointerenter", enter);
      viewport.removeEventListener("pointerleave", leave);
      viewport.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      viewport.removeEventListener("wheel", delayResume);
      viewport.removeEventListener("focusin", focus);
      viewport.removeEventListener("focusout", blur);
    };
  }, [loop, paused, basketKey]);

  return (
    <div className="basket-marquee">
      <div
        className="basket-marquee-viewport"
        ref={viewportRef}
        role="group"
        aria-label="Theme baskets"
        aria-live="off"
        onFocus={(event) => {
          if (!loop)
            event.target.closest<HTMLElement>(".basket-card")?.scrollIntoView({
              block: "nearest",
              inline: "nearest",
              behavior: "instant",
            });
        }}
      >
        <div className="basket-marquee-track">
          <div className="basket-marquee-set" ref={originalsRef}>
            {baskets.map((basket, index) => (
              <BasketCard
                key={basket.id}
                basket={basket}
                index={index}
                prefetch={false}
              />
            ))}
          </div>
          {loop && (
            <div
              className="basket-marquee-set"
              ref={copyRef}
              aria-hidden="true"
            >
              {baskets.map((basket, index) => (
                <BasketCard
                  key={basket.id}
                  basket={basket}
                  index={index}
                  tabIndex={-1}
                  prefetch={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="basket-marquee-controls">
        <p>
          {reducedMotion
            ? "Browse every theme at your pace."
            : "A world of ideas, always in view."}
        </p>
        {!reducedMotion && baskets.length > 1 && (
          <button
            type="button"
            className="basket-motion-toggle"
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? (
              <Play size={14} aria-hidden="true" />
            ) : (
              <Pause size={14} aria-hidden="true" />
            )}
            {paused ? "Play animation" : "Pause animation"}
          </button>
        )}
      </div>
    </div>
  );
}
