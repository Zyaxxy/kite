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
      <div className="w-full max-w-md rounded-2xl border border-[#2f3b2f] bg-[#1d261e] p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3 text-amber-300">
          <Beaker size={24} />
          <h2
            id="devnet-recurring-title"
            className="m-0 text-lg font-semibold text-[#f5f8f0]"
          >
            Devnet Test Feature
          </h2>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-[#a6b2a4]">
          The trustless on-chain smart-contract for recurring investments is currently in development. This feature is only available on <strong>Devnet</strong> with devnet test features. Actual mainnet recurring execution is disabled during this period.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            className="btn full text-sm"
            onClick={() => setOpen(false)}
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
