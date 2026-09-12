'use client';

import React, { useMemo, useState } from 'react';
import { CURATED_BASKETS } from '@kite/sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import { AmountField } from '../../components/AmountField';
import { PrimaryButton } from '../../components/PrimaryButton';

const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;

export default function SipPage() {
  const { connected } = useWallet();
  const [targetAsset, setTargetAsset] = useState('MAG7');
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>('weekly');
  const [amountUsdc, setAmountUsdc] = useState('25');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<{
    targetAsset: string;
    frequency: string;
    amountUsdc: string;
    nextRun: string;
  } | null>(null);

  const options = useMemo(
    () => [
      ...CURATED_BASKETS.map((b) => ({ value: b.ticker, label: `${b.name} (${b.ticker})` })),
      { value: 'NVDA', label: 'Nvidia Corp. (NVDA)' },
      { value: 'AAPL', label: 'Apple Inc. (AAPL)' },
      { value: 'TSLA', label: 'Tesla Inc. (TSLA)' },
    ],
    []
  );

  const nextRun = frequency === 'daily' ? 'Next session 9:30 AM ET' : frequency === 'weekly' ? 'Monday 9:30 AM ET' : '1st trading day next month';

  const handleCreateSip = () => {
    setError(null);
    if (!Number.isFinite(Number(amountUsdc)) || Number(amountUsdc) <= 0) {
      setError('Enter a per-cycle amount greater than 0.');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setActivePlan({
        targetAsset,
        frequency,
        amountUsdc,
        nextRun,
      });
    }, 1200);
  };

  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
      <section>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Start a SIP</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Same three fields as a debit mandate: scheme, cadence, amount. Jupiter DCA pulls USDC from the wallet you connect.
          </p>
        </header>

        <div className="space-y-5">
          <div>
            <label htmlFor="scheme" className="mb-1.5 block text-sm text-muted">
              Scheme
            </label>
            <select
              id="scheme"
              value={targetAsset}
              onChange={(e) => setTargetAsset(e.target.value)}
              className="w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm text-ink"
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm text-muted">Every</legend>
            <div className="grid grid-cols-3 gap-2">
              {FREQUENCIES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={`rounded-md border py-2 text-sm capitalize transition-colors duration-150 ease-out ${
                    frequency === f
                      ? 'border-accent bg-raised font-semibold text-ink'
                      : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </fieldset>

          <AmountField id="sip-amount" label="Amount each cycle" value={amountUsdc} onChange={setAmountUsdc} />

          <p className="text-sm text-muted">Next debit: {nextRun}</p>

          <PrimaryButton onClick={handleCreateSip} disabled={!connected} pending={isSubmitting}>
            {!connected ? 'Connect wallet to start SIP' : 'Activate plan'}
          </PrimaryButton>
          {error && (
            <p className="text-sm text-down" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Active plans</h2>
        {activePlan ? (
          <dl className="mt-4 space-y-3 border-y border-line py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Scheme</dt>
              <dd className="font-medium">{activePlan.targetAsset}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Order</dt>
              <dd className="tabular-nums">
                ${activePlan.amountUsdc} / {activePlan.frequency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Next run</dt>
              <dd>{activePlan.nextRun}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Status</dt>
              <dd className="text-up">Active · demo</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 border-y border-line py-8 text-sm text-muted">
            No SIP yet. Fill the three fields and activate — the plan will show here with the next debit time.
          </p>
        )}
      </section>
    </div>
  );
}
