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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3 mb-4 text-amber-500">
          <Beaker size={24} />
          <h2
            id="devnet-recurring-title"
            className="text-lg font-bold text-neutral-900 dark:text-white m-0"
          >
            Devnet Test Feature
          </h2>
        </div>
        <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
          The trustless on-chain smart-contract for recurring investments is currently in development. This feature is only available on <strong>Devnet</strong> with devnet test features. Actual mainnet recurring execution is disabled during this period.
        </p>
        <div className="flex justify-end">
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
