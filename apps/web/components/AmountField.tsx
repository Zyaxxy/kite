'use client';

import React from 'react';

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
};

export function AmountField({ id, label, value, onChange, suffix = 'USDC' }: Props) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-line bg-bg px-3 py-2.5 font-sans text-base tabular-nums text-ink placeholder:text-muted focus:border-accent"
          placeholder="0"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
          {suffix}
        </span>
      </div>
    </div>
  );
}
