'use client';

import React, { useState } from 'react';
import { CURATED_BASKETS } from '@kite/sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import { AmountField } from '../../components/AmountField';
import { PrimaryButton } from '../../components/PrimaryButton';

export default function BasketsPage() {
  const { connected } = useWallet();
  const [selectedId, setSelectedId] = useState(CURATED_BASKETS[0].id);
  const [usdcAmount, setUsdcAmount] = useState('100');
  const [isMinting, setIsMinting] = useState(false);
  const [mintSuccess, setMintSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBasket = CURATED_BASKETS.find((b) => b.id === selectedId) ?? CURATED_BASKETS[0];
  const amount = Number(usdcAmount);

  const handleMint = async () => {
    setError(null);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a USDC amount greater than 0.');
      return;
    }
    setIsMinting(true);
    setTimeout(() => {
      setIsMinting(false);
      setMintSuccess(true);
      setTimeout(() => setMintSuccess(false), 5000);
    }, 1500);
  };

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
      <section className="lg:col-span-8">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Thematic baskets</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            One USDC debit, atomic Jupiter legs, SPL basket tokens back to the same wallet.
          </p>
        </header>

        <div className="flex flex-col gap-8">
          {CURATED_BASKETS.map((basket) => {
            const isSelected = selectedBasket.id === basket.id;
            return (
              <article key={basket.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(basket.id)}
                  className={`w-full text-left ${isSelected ? '' : 'opacity-70 hover:opacity-100'}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold">
                      {basket.name}{' '}
                      <span className="text-sm font-medium tabular-nums text-muted">{basket.ticker}</span>
                    </h2>
                    {isSelected ? (
                      <span className="text-xs font-semibold text-accent">Selected</span>
                    ) : (
                      <span className="text-xs text-muted">Select</span>
                    )}
                  </div>
                </button>

                <p className="mt-1 text-sm text-muted">{basket.description}</p>

                <div className="mt-3 flex h-1.5 overflow-hidden rounded-sm bg-raised" aria-hidden="true">
                  {basket.assets.map((asset, i) => (
                    <span
                      key={asset.symbol}
                      className="h-full"
                      style={{
                        width: `${asset.weight / 100}%`,
                        background: `oklch(${0.55 + i * 0.06} 0.1 ${163 + i * 18})`,
                      }}
                    />
                  ))}
                </div>

                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="py-1.5 text-left font-medium">Holding</th>
                      <th className="py-1.5 text-right font-medium">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {basket.assets.map((asset) => (
                      <tr key={asset.symbol} className="border-t border-line">
                        <td className="py-2">
                          <span className="font-medium">{asset.symbol}</span>
                          <span className="ml-2 text-muted">{asset.name}</span>
                        </td>
                        <td className="py-2 text-right tabular-nums">{(asset.weight / 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="h-fit lg:col-span-4 lg:sticky lg:top-20">
        <h2 className="text-lg font-semibold">Lumpsum</h2>
        <p className="mt-1 text-sm text-muted">
          Debit USDC, mint {selectedBasket.ticker} to the connected wallet. Simulated on this demo.
        </p>

        <div className="mt-5 space-y-4">
          <AmountField id="lumpsum" label="You pay" value={usdcAmount} onChange={setUsdcAmount} />

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Scheme</dt>
              <dd className="tabular-nums">{selectedBasket.ticker}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Network</dt>
              <dd className="tabular-nums">~0.0005 SOL</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Management fee</dt>
              <dd className="tabular-nums">0%</dd>
            </div>
          </dl>

          <PrimaryButton onClick={handleMint} disabled={!connected} pending={isMinting}>
            {!connected ? 'Connect wallet to buy' : `Buy ${selectedBasket.ticker}`}
          </PrimaryButton>

          {error && (
            <p className="text-sm text-down" role="alert">
              {error}
            </p>
          )}
          {mintSuccess && (
            <p className="text-sm text-up" role="status">
              Minted {usdcAmount} USDC into {selectedBasket.ticker}. Demo only — no onchain transfer.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
