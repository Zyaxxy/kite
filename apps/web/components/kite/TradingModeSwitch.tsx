"use client";

import { useId } from "react";
import { useKite } from "./State";

export function TradingModeSwitch() {
  const { mode, setMode } = useKite();
  const name = useId();

  return (
    <div className="header-mode">
      <span className="header-mode-caption">Trading mode</span>
      <div
        className="trading-mode"
        data-mode={mode}
        role="radiogroup"
        aria-label="Trading mode"
      >
        <span className="trading-mode-indicator" aria-hidden="true" />
        {(["paper", "actual"] as const).map((value) => (
          <label className="trading-mode-option" key={value}>
            <input
              type="radio"
              name={name}
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              aria-label={
                value === "paper" ? "Paper trading" : "Actual trading"
              }
            />
            <span>{value === "paper" ? "Paper" : "Actual"}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
