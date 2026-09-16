"use client";

import { useEffect, useState } from "react";
import { Beaker } from "lucide-react";

export function RecurringDevnetDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(true);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="devnet-recurring-title"
      className="recurring-devnet-backdrop"
    >
      <div className="recurring-devnet-dialog">
        <div className="recurring-devnet-heading">
          <Beaker size={24} />
          <h2 id="devnet-recurring-title">Devnet Test Feature</h2>
        </div>
        <p className="recurring-devnet-copy">
          The trustless on-chain smart-contract for recurring investments is
          currently in development. This feature is only available on{" "}
          <strong>Devnet</strong> with devnet test features. Actual mainnet
          recurring execution is disabled during this period.
        </p>
        <div className="recurring-devnet-actions">
          <button
            type="button"
            className="btn full"
            onClick={() => setOpen(false)}
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
