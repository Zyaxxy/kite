'use client';

import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
};

export function PrimaryButton({ pending, className = '', children, disabled, ...rest }: Props) {
  const isDisabled = disabled || pending;
  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={`flex w-full items-center justify-center rounded-md px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ease-out ${
        isDisabled
          ? 'cursor-not-allowed bg-raised text-muted'
          : 'bg-accent text-accent-ink hover:bg-[oklch(0.78_0.14_163)]'
      } ${className}`}
    >
      {pending ? 'Working…' : children}
    </button>
  );
}
