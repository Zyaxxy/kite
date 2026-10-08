"use client";

import { useRef } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Clock3,
  Pause,
  Repeat2,
  ShieldCheck,
  Wallet2,
} from "lucide-react";
import { gsap, useScrollStory } from "./landing-motion";
import styles from "./Landing.module.css";

const steps = [
  {
    title: "Keep funds in your wallet",
    detail:
      "Test KUSD stays in your wallet until a scheduled installment is due.",
  },
  {
    title: "Authorize a bounded plan",
    detail:
      "Approve the amount, cadence, allocation and end date. The Guard enforces your plan’s limits.",
  },
  {
    title: "Run a due installment",
    detail:
      "The devnet collector triggers the Guard to collect only the test KUSD allowed by the plan.",
  },
  {
    title: "Receive test stock outputs",
    detail:
      "The demo mints test stock tokens to your wallet accounts. Your plan remains bounded by its schedule.",
  },
] as const;

/** All positions are normalized scroll beats, never autonomous playback. */
function buildRecurringStory(
  timeline: gsap.core.Timeline,
  element: HTMLDivElement,
) {
  const captions = Array.from(element.querySelectorAll("[data-story-caption]"));
  timeline
    .set(captions, { autoAlpha: 0, y: 6 }, 0)
    .set(captions[0], { autoAlpha: 1, y: 0 }, 0);
  for (let index = 1; index < captions.length; index++) {
    const at = index / steps.length;
    timeline
      .to(
        captions[index - 1],
        { autoAlpha: 0, y: -6, duration: 0.035 },
        at - 0.03,
      )
      .to(
        captions[index],
        { autoAlpha: 1, y: 0, duration: 0.06, ease: "power2.out" },
        at - 0.02,
      );
  }
  timeline
    .fromTo(
      element.querySelector("[data-flow-line]"),
      { scaleY: 0, transformOrigin: "top" },
      {
        scaleY: 1,
        duration: 0.14,
        ease: "power2.inOut",
      },
      0.12,
    )
    .fromTo(
      element.querySelector("[data-plan-node]"),
      { y: 8 },
      {
        y: 0,
        duration: 0.1,
        ease: "power2.out",
      },
      0.26,
    )
    .fromTo(
      element.querySelector("[data-flow-branch]"),
      { strokeDashoffset: 1 },
      {
        strokeDashoffset: 0,
        duration: 0.15,
        ease: "power2.inOut",
      },
      0.48,
    )
    .fromTo(
      element.querySelector("[data-flow-pulse]"),
      { opacity: 0, y: 0 },
      {
        opacity: 1,
        y: 34,
        duration: 0.13,
        ease: "power1.inOut",
      },
      0.54,
    )
    .to(
      element.querySelector("[data-flow-pulse]"),
      { opacity: 0, duration: 0.025 },
      0.67,
    )
    .fromTo(
      element.querySelectorAll("[data-stock-output]"),
      { y: 12 },
      {
        y: 0,
        duration: 0.09,
        stagger: 0.018,
        ease: "power2.out",
      },
      0.73,
    );
}

export function LandingRecurring() {
  const root = useRef<HTMLDivElement>(null);
  const { step, mode, select, toggle } = useScrollStory(
    root,
    steps.length,
    "kite-recurring-story",
    buildRecurringStory,
  );
  return (
    <div
      className={styles.recurringVisual}
      ref={root}
      data-step={step}
      data-scroll-mode={mode}
      data-scroll-available={mode !== "static"}
      data-story-stage
    >
      <div className={styles.recurringTop}>
        <span className={styles.storyHint}>
          <ArrowDown size={14} />
          {mode === "static" ? "Explore the plan" : "Scroll through the plan"}
        </span>
        <button
          onClick={toggle}
          aria-label={
            mode === "static"
              ? "Next recurring illustration step"
              : mode === "scroll"
                ? "Pause recurring scroll story"
                : "Follow scroll in recurring illustration"
          }
        >
          {mode === "scroll" ? (
            <Pause size={15} />
          ) : mode === "static" ? (
            <ArrowRight size={15} />
          ) : (
            <ArrowDown size={15} />
          )}
          <span>
            {mode === "scroll"
              ? "Pause"
              : mode === "static"
                ? "Next step"
                : "Follow scroll"}
          </span>
        </button>
      </div>
      <div
        className={styles.planDiagram}
        aria-label="Illustrated devnet plan: wallet, bounded authorization, due installment, test stocks to your wallet"
      >
        <div
          className={`${styles.walletNode} ${step === 0 ? styles.activeNode : ""}`}
        >
          <span>
            <Wallet2 size={25} strokeWidth={1.4} />
          </span>
          <div>
            <small>01 / YOUR WALLET</small>
            <strong>Funds stay with you</strong>
          </div>
          <ShieldCheck size={21} />
        </div>
        <div className={styles.flowConnector}>
          <span data-flow-line />
          <ArrowDown size={15} />
        </div>
        <div
          className={`${styles.planNode} ${step === 1 || step === 2 ? styles.activeNode : ""}`}
          data-plan-node
        >
          <div className={styles.planNodeHeading}>
            <span>
              <Repeat2 size={19} />
              Your recurring plan
            </span>
            <span className={styles.planTestLabel}>TEST TOKENS</span>
          </div>
          <div className={styles.planAmount}>
            <strong>
              100 <small>KUSD</small>
            </strong>
            <span>
              <Clock3 size={13} /> Every week
            </span>
          </div>
          <div className={styles.planTerms}>
            <span>
              Duration<strong>12 weeks</strong>
            </span>
            <span>
              Funding limit<strong>1,200 test KUSD</strong>
            </span>
          </div>
          <div className={styles.guardLabel}>
            <ShieldCheck size={14} />
            Bounded authorization · enforced by Kite Guard
          </div>
        </div>
        <div className={styles.branchConnectors} aria-hidden="true">
          <svg viewBox="0 0 400 52" preserveAspectRatio="none">
            <path d="M200 0V25M65 52V25H335V52M200 25V52" />
            <path
              className={styles.branchActive}
              data-flow-branch
              pathLength="1"
              strokeDasharray="1"
              d="M200 0V25M65 52V25H335V52M200 25V52"
            />
          </svg>
          <span className={styles.flowPulse} data-flow-pulse />
        </div>
        <div
          className={`${styles.outputNodes} ${step === 3 ? styles.outputsActive : ""}`}
        >
          {["Test AAPL", "Test NVDA", "Test TSLA"].map((name) => (
            <div key={name} data-stock-output>
              <svg
                viewBox="0 0 32 32"
                width="28"
                height="28"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m16 3 13 7-13 7-13-7 13-7Z"
                  fill="currentColor"
                  fillOpacity=".15"
                  stroke="currentColor"
                />
                <path
                  d="m3 16 13 7 13-7M3 22l13 7 13-7"
                  stroke="currentColor"
                />
              </svg>
              <strong>{name}</strong>
              <small>Wallet output</small>
            </div>
          ))}
        </div>
        <div className={styles.walletReturn} data-wallet-return>
          <Check size={14} />
          Output accounts belong to your wallet
        </div>
      </div>
      <div className={styles.demoCaption}>
        Illustrated plan · Devnet test tokens · Not a live investment
      </div>
      <div className={styles.storyProgress} aria-hidden="true">
        <span data-story-progress />
      </div>
      <div
        className={styles.flowSteps}
        aria-label="Recurring illustration steps"
      >
        {steps.map((item, index) => (
          <button
            key={item.title}
            aria-label={`Step ${index + 1}: ${item.title}`}
            aria-pressed={step === index}
            onClick={() => select(index)}
          >
            {String(index + 1).padStart(2, "0")}
          </button>
        ))}
        <span className={styles.scrollCue}>
          <ArrowDown size={13} />
          {mode === "scroll" ? "Scroll to explore" : "Choose a step"}
        </span>
      </div>
      <div
        className={styles.flowDescription}
        aria-live={mode === "scroll" ? "off" : "polite"}
        aria-atomic="true"
      >
        {steps.map((item, index) => (
          <div
            className={styles.storyCaption}
            data-story-caption
            key={item.title}
            aria-hidden={step !== index}
          >
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
