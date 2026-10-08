"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { landingTextTargets } from "./landing-text-reveal";
import {
  resumesOnScroll,
  pinnedStoryLayout,
  storyAnimationProgress,
  storyGeometry,
  storyStep,
  type StoryMode,
} from "./landing-story-state";

gsap.registerPlugin(useGSAP, ScrollTrigger);
export { gsap, ScrollTrigger, useGSAP };

const TIMING = {
  hero: 1.15,
  line: 0.88,
  lineStagger: 0.12,
  introAt: 0.24,
  intro: 0.65,
  detailAt: 0.42,
  detail: 0.55,
  scrub: 0.32,
} as const;

/** A fast scroll must not leave a reading entrance running after pin release. */
function finishChapterText(chapter: HTMLElement) {
  chapter
    .querySelectorAll<HTMLElement>('[data-text-reveal="pending"]')
    .forEach((element) => {
      gsap.killTweensOf(element);
      gsap.set(element, { clearProps: "transform,opacity,willChange,display" });
      element.dataset.textReveal = "complete";
    });
}

/*
 * ENTRY STORYBOARD (absolute from enhancement; the shell/CTAs stay usable)
 *   0ms  artwork settles; first headline line rolls through its mask
 * 120ms  second headline line follows
 * 240ms  supporting copy settles
 * 420ms  ownership detail arrives
 * 1150ms entrance complete; below-fold text reveals once on first approach
 */

/** Separate owners for hero, one-time reading text and scroll-driven stories. */
export function useLandingMotion(root: RefObject<HTMLDivElement>) {
  const revealed = useRef(new WeakSet<HTMLElement>());
  useGSAP(
    () => {
      const page = root.current;
      if (!page) return;
      const media = gsap.matchMedia();
      media.add(
        "(prefers-reduced-motion: no-preference)",
        () => {
          const hero = page.querySelector("[data-hero]");
          if (hero && hero.getBoundingClientRect().bottom > 0) {
            const entrance = gsap.timeline({
              defaults: { ease: "power3.out" },
            });
            entrance
              .fromTo(
                "[data-hero-media]",
                { scale: 1.06, xPercent: 6, opacity: 0.4 },
                { scale: 1, xPercent: 0, opacity: 1, duration: TIMING.hero },
                0,
              )
              .fromTo(
                "[data-hero-line]",
                { yPercent: 76, opacity: 0.7 },
                {
                  yPercent: 0,
                  opacity: 1,
                  duration: TIMING.line,
                  stagger: TIMING.lineStagger,
                },
                0,
              )
              .fromTo(
                "[data-hero-intro]",
                { y: 12, opacity: 0.65 },
                {
                  y: 0,
                  opacity: 1,
                  duration: TIMING.intro,
                },
                TIMING.introAt,
              )
              .fromTo(
                "[data-hero-detail]",
                { y: 8, opacity: 0.75 },
                {
                  y: 0,
                  opacity: 1,
                  duration: TIMING.detail,
                },
                TIMING.detailAt,
              );
          }

          const image = page.querySelector("[data-hero-image]");
          if (hero && image) {
            // The entrance owns the media wrapper; scroll owns only the image.
            gsap.fromTo(
              image,
              { yPercent: 0 },
              {
                yPercent: -4,
                ease: "none",
                scrollTrigger: {
                  trigger: hero,
                  start: "top top",
                  end: "bottom top",
                  scrub: TIMING.scrub,
                },
              },
            );
          }

          const text = landingTextTargets(page).filter((element) => {
            if (revealed.current.has(element)) return false;
            // Keep restored/in-view content readable; don't replay on Back.
            if (element.getBoundingClientRect().top < innerHeight * 0.92) {
              revealed.current.add(element);
              return false;
            }
            element.dataset.textReveal = "pending";
            return true;
          });
          const finishText = (element: HTMLElement) => {
            revealed.current.add(element);
            gsap.killTweensOf(element);
            gsap.set(element, {
              clearProps: "transform,opacity,willChange,display",
            });
            element.dataset.textReveal = "complete";
          };
          // Inline labels need a transformable box; default/no-JS CSS stays visible.
          text.forEach((element) => {
            gsap.set(element, {
              y: element.matches("h2, h3") ? 28 : 18,
              opacity: 0,
              ...(getComputedStyle(element).display === "inline"
                ? { display: "inline-block" }
                : {}),
            });
          });
          ScrollTrigger.batch(text, {
            start: (trigger) =>
              Math.min(
                trigger.trigger!.getBoundingClientRect().top +
                  window.scrollY -
                  innerHeight * 0.92,
                Math.max(0, ScrollTrigger.maxScroll(window) - 1),
              ),
            once: true,
            interval: 0.06,
            batchMax: 6,
            onEnter: (batch) => {
              const entering = new Set(batch as HTMLElement[]);
              // The footer is one reading group, including links near maxScroll.
              // Reveal it on approach rather than leaving its last row concealed.
              for (const element of batch as HTMLElement[]) {
                const footer = element.closest("footer");
                if (footer)
                  text.forEach((target) => {
                    if (footer.contains(target)) entering.add(target);
                  });
              }
              const visible = Array.from(entering).filter((element) => {
                if (revealed.current.has(element)) return false;
                revealed.current.add(element);
                if (element.dataset.textReveal === "complete") return false;
                if (element.getBoundingClientRect().bottom <= 0) {
                  finishText(element);
                  return false;
                }
                return true;
              });
              gsap.to(visible, {
                y: 0,
                opacity: 1,
                duration: 0.72,
                stagger: 0.065,
                ease: "power3.out",
                overwrite: "auto",
                onStart: () =>
                  gsap.set(visible, { willChange: "transform,opacity" }),
                onComplete: () => visible.forEach(finishText),
              });
            },
          });
          const revealFocusedText = (event: FocusEvent) => {
            if (!(event.target instanceof Element)) return;
            text.forEach((element) => {
              if (
                element.contains(event.target as Node) ||
                (event.target instanceof Element &&
                  event.target.contains(element))
              ) {
                finishText(element);
              }
            });
          };
          page.addEventListener("focusin", revealFocusedText);
          // Pin a fitting chapter, or its smaller stage. No wheel interception.
          const sequences = Array.from(
            page.querySelectorAll<HTMLElement>("[data-section-sequence]"),
          );
          const sequenceCleanups = sequences.map((section) => {
            let driver: ScrollTrigger | undefined;
            let key = "";
            let pinTarget = section;
            const stage =
              section.querySelector<HTMLElement>("[data-sequence-stage]") ??
              section;
            const timeline = gsap.timeline({ paused: true });
            const bar = section.querySelector("[data-allocation-bar]");
            const articles = section.querySelectorAll<HTMLElement>(
              "[data-sequence-owned] > article",
            );
            if (bar)
              timeline.fromTo(
                Array.from(bar.children),
                { scaleX: 0.15, transformOrigin: "left" },
                {
                  scaleX: 1,
                  duration: 0.65,
                  stagger: 0.05,
                  ease: "power3.out",
                },
                0,
              );
            articles.forEach((article, index) => {
              timeline.fromTo(
                article,
                { y: 24, opacity: 0.25 },
                { y: 0, opacity: 1, duration: 0.22, ease: "power3.out" },
                index * 0.24,
              );
            });
            timeline.to(
              {},
              { duration: 0.15 },
              Math.max(0.85, timeline.duration()),
            );
            const measure = () => {
              const previous = driver;
              const chapterHeight =
                section.offsetHeight -
                (pinTarget !== section && previous?.pin
                  ? previous.end - previous.start
                  : 0);
              const next = [
                innerWidth,
                innerHeight,
                chapterHeight,
                stage.offsetHeight,
              ].join(":");
              if (next === key) return false;
              key = next;
              driver?.kill(true);
              const layout = pinnedStoryLayout(
                innerHeight,
                chapterHeight,
                stage.offsetHeight,
                2,
              );
              pinTarget = layout.target === "chapter" ? section : stage;
              section.dataset.sequenceLayout = layout.fits
                ? layout.target === "chapter"
                  ? "pinned"
                  : "stage-pinned"
                : "inline";
              const render = (self: ScrollTrigger) => {
                const progress = storyAnimationProgress(self.progress);
                timeline.progress(progress).pause();
                section.dataset.animationProgress = String(progress);
                if (progress === 1) finishChapterText(pinTarget);
              };
              driver = ScrollTrigger.create({
                id: "kite-" + section.dataset.sectionSequence,
                refreshPriority:
                  section.dataset.sectionSequence === "allocation" ? 80 : 60,
                trigger: pinTarget,
                start: layout.fits ? "top " + layout.top : "top 80%",
                end: layout.fits
                  ? "+=" + Math.round(innerHeight * 0.9)
                  : "bottom 25%",
                pin: layout.fits ? pinTarget : false,
                pinSpacing: true,
                anticipatePin: 1,
                invalidateOnRefresh: true,
                onUpdate: render,
                onRefresh: (self) => {
                  section.dataset.storyStart = String(self.start);
                  section.dataset.storyEnd = String(self.end);
                  render(self);
                },
              });
              return true;
            };
            let frame = 0;
            const update = () => {
              if (!frame)
                frame = requestAnimationFrame(() => {
                  frame = 0;
                  if (measure()) ScrollTrigger.refresh();
                });
            };
            const observer = new ResizeObserver(update);
            observer.observe(section);
            if (stage !== section) observer.observe(stage);
            window.addEventListener("resize", update, { passive: true });
            measure();
            return () => {
              cancelAnimationFrame(frame);
              observer.disconnect();
              window.removeEventListener("resize", update);
              driver?.kill(true);
              timeline.revert();
              delete section.dataset.sequenceLayout;
              delete section.dataset.animationProgress;
              delete section.dataset.storyStart;
              delete section.dataset.storyEnd;
            };
          });

          const progress = page.querySelector("[data-page-progress]");
          if (progress) {
            gsap.fromTo(
              progress,
              { scaleX: 0 },
              {
                scaleX: 1,
                ease: "none",
                scrollTrigger: {
                  trigger: page,
                  start: "top top",
                  end: "bottom bottom",
                  scrub: true,
                },
              },
            );
          }

          let active = true;
          let frame = 0;
          const refresh = () => {
            if (!active || frame) return;
            frame = requestAnimationFrame(() => {
              frame = 0;
              if (active) ScrollTrigger.refresh();
            });
          };
          const observer = new ResizeObserver(refresh);
          page
            .querySelectorAll("[data-motion-layout]")
            .forEach((node) => observer.observe(node));
          void document.fonts.ready.then(refresh);
          return () => {
            sequenceCleanups.forEach((cleanup) => cleanup());
            page.removeEventListener("focusin", revealFocusedText);
            text.forEach((element) => {
              gsap.killTweensOf(element);
              delete element.dataset.textReveal;
            });
            active = false;
            cancelAnimationFrame(frame);
            observer.disconnect();
          };
        },
        page,
      );
      return () => media.revert();
    },
    { scope: root },
  );
}

type StoryController = {
  select: (index: number) => void;
  toggle: () => void;
};

/**
 * A finite pinned chapter + one scroll-scrubbed GSAP driver per story.
 * The timeline NEVER plays by itself. React updates only at stage boundaries.
 */
export function useScrollStory(
  root: RefObject<HTMLDivElement>,
  count: number,
  id: string,
  build: (timeline: gsap.core.Timeline, element: HTMLDivElement) => void,
) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<StoryMode>("static");
  const [sticky, setSticky] = useState(false);
  const selected = useRef(0);
  const modeRef = useRef<StoryMode>("static");
  const controller = useRef<StoryController | null>(null);

  const commit = useCallback((index: number) => {
    if (selected.current === index) return;
    selected.current = index;
    setStep(index);
  }, []);
  const changeMode = useCallback((next: StoryMode) => {
    if (modeRef.current === next) return;
    modeRef.current = next;
    setMode(next);
  }, []);

  useGSAP(
    () => {
      const element = root.current;
      const track = element?.closest<HTMLElement>("[data-scroll-track]");
      if (!element || !track) return;
      const media = gsap.matchMedia();
      media.add(
        "(prefers-reduced-motion: no-preference)",
        () => {
          let active = true;
          let frame = 0;
          let selectedAt = window.scrollY;
          let dimensions = "";
          let driver: ScrollTrigger | undefined;
          const chapter =
            track.closest<HTMLElement>("[data-scroll-lock]") ?? track;
          let pinTarget = track;
          let layout = storyGeometry(
            window.innerHeight,
            element.offsetHeight,
            count,
            96, // Floating navigation plus a reading/focus clearance.
          );
          const timeline = gsap.timeline({
            paused: true,
            defaults: { ease: "none" },
          });
          build(timeline, element);
          timeline.fromTo(
            element.querySelector("[data-story-progress]"),
            { scaleX: 0 },
            {
              scaleX: 1,
              duration: 1,
              ease: "none",
            },
            0,
          );
          changeMode("scroll");

          const render = (pinProgress = driver?.progress ?? 0) => {
            if (!active) return;
            if (resumesOnScroll(modeRef.current, selectedAt, window.scrollY))
              changeMode("scroll");
            if (modeRef.current !== "scroll") return;
            const progress = storyAnimationProgress(pinProgress);
            const next = storyStep(progress, count);
            // Never hide a keyboard-focused article/link beneath a new chapter.
            if (
              next !== selected.current &&
              element.querySelector('[role="tabpanel"]:focus-within')
            ) {
              changeMode("paused");
              return;
            }
            timeline.progress(progress).pause();
            track.dataset.animationProgress = String(progress);
            if (progress === 1) finishChapterText(chapter);
            commit(next);
          };
          const measure = () => {
            const height = track.offsetHeight;
            const chapterHeight =
              chapter.offsetHeight -
              (pinTarget === track && driver?.pin ? layout.distance : 0);
            const key = [
              window.innerWidth,
              window.innerHeight,
              height,
              chapterHeight,
            ].join(":");
            if (key === dimensions) return false;
            dimensions = key;
            const measured = pinnedStoryLayout(
              innerHeight,
              chapterHeight,
              height,
              count,
            );
            pinTarget = measured.target === "chapter" ? chapter : track;
            layout = measured;
            track.dataset.scrollStory = layout.fits ? "pinned" : "inline";
            chapter.dataset.chapterLayout =
              measured.target === "chapter"
                ? "pinned"
                : layout.fits
                  ? "stage-pinned"
                  : "inline";
            setSticky(layout.fits);
            driver?.kill(true);
            driver = ScrollTrigger.create({
              id,
              refreshPriority: id.includes("research") ? 90 : 70,
              trigger: pinTarget,
              start: layout.fits ? "top " + layout.top + "px" : "top 70%",
              end: layout.fits ? "+=" + layout.distance : "bottom 30%",
              pin: layout.fits ? pinTarget : false,
              pinSpacing: true,
              anticipatePin: 1,
              invalidateOnRefresh: true,
              onUpdate: (self) => render(self.progress),
              onRefresh: (self) => {
                track.dataset.storyStart = String(self.start);
                track.dataset.storyEnd = String(self.end);
                render(self.progress);
              },
            });
            return true;
          };
          measure();
          controller.current = {
            select(index) {
              selectedAt = window.scrollY;
              changeMode("selected");
              timeline.progress((index + 0.5) / count).pause();
              commit(index);
            },
            toggle() {
              if (modeRef.current === "scroll") changeMode("paused");
              else {
                changeMode("scroll");
                render();
              }
            },
          };
          const scheduleMeasure = () => {
            if (frame || !active) return;
            frame = requestAnimationFrame(() => {
              frame = 0;
              if (active && measure()) ScrollTrigger.refresh();
            });
          };
          const observer = new ResizeObserver(scheduleMeasure);
          observer.observe(element);
          observer.observe(chapter);
          window.addEventListener("resize", scheduleMeasure, { passive: true });
          void document.fonts.ready.then(scheduleMeasure);
          ScrollTrigger.refresh();
          render();

          return () => {
            active = false;
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener("resize", scheduleMeasure);
            controller.current = null;
            driver?.kill(true);
            timeline.revert();
            delete chapter.dataset.chapterLayout;
            track.removeAttribute("data-scroll-story");
            delete track.dataset.storyStart;
            delete track.dataset.storyEnd;
            delete track.dataset.animationProgress;
            ["--story-height", "--story-distance", "--story-top"].forEach(
              (property) => track.style.removeProperty(property),
            );
            setSticky(false);
            changeMode("static");
          };
        },
        element,
      );
      return () => media.revert();
    },
    { scope: root, dependencies: [count, id], revertOnUpdate: true },
  );

  const select = useCallback(
    (index: number) => {
      if (!Number.isInteger(index) || index < 0 || index >= count) return;
      if (controller.current) controller.current.select(index);
      else commit(index);
    },
    [commit, count],
  );
  const toggle = useCallback(() => {
    if (controller.current) controller.current.toggle();
    else commit((selected.current + 1) % count);
  }, [commit, count]);

  return { step, mode, sticky, select, toggle };
}
