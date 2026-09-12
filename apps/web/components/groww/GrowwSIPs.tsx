'use client';

import React, { useState } from 'react';
import { USER_ACTIVE_SIPS, ActiveSIP, POPULAR_BASKETS, GROWW_STOCKS } from '../../lib/groww-data';
import { Calendar, Plus, Pause, Play, Trash2, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface GrowwSIPsProps {
  onStartNewSIP?: () => void;
}

export function GrowwSIPs({ onStartNewSIP }: GrowwSIPsProps) {
  const [sips, setSips] = useState<ActiveSIP[]>(USER_ACTIVE_SIPS);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTarget, setNewTarget] = useState('SOL-MAG7');
  const [newAmount, setNewAmount] = useState('250');
  const [newFreq, setNewFreq] = useState<'Monthly' | 'Weekly' | 'Daily'>('Monthly');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const totalMonthly = sips
    .filter((s) => s.status === 'Active')
    .reduce((acc, s) => acc + s.amount, 0);

  const togglePause = (id: string) => {
    setSips((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const updatedStatus = s.status === 'Active' ? 'Paused' : 'Active';
          setToastMsg(`SIP for ${s.name} is now ${updatedStatus}`);
          setTimeout(() => setToastMsg(null), 3000);
          return { ...s, status: updatedStatus };
        }
        return s;
      })
    );
  };

  const handleCreateSIP = () => {
    const amt = parseFloat(newAmount) || 100;
    const basket = POPULAR_BASKETS.find((b) => b.ticker === newTarget);
    const stock = GROWW_STOCKS[newTarget];
    const name = basket?.name || stock?.name || newTarget;

    const newSipObj: ActiveSIP = {
      id: `sip-${Date.now()}`,
      name,
      targetSymbol: newTarget,
      amount: amt,
      frequency: newFreq,
      nextDueDate: '25 Sep',
      category: basket ? 'Basket' : 'Stock',
      totalInvested: amt,
      currentValue: amt,
      returnsPercent: 0,
      iconBg: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
      iconLetter: newTarget.slice(0, 2),
      status: 'Active'
    };

    setSips([newSipObj, ...sips]);
    setCreateModalOpen(false);
    setToastMsg(`Created new automated ${newFreq} SIP for ${name} (${amt} USDC)`);
    setTimeout(() => setToastMsg(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Monthly SIP amount header matching Groww Screenshot 2026-09-11 203335.png */}
      <div className="bg-[#181A20] border border-[#262A34] rounded-xl p-6 shadow-xl flex items-center justify-between">
        <div>
          <span className="text-xs text-[#8B949E] block mb-1">Monthly SIP amount</span>
          <div className="text-3xl font-bold text-white font-mono tracking-tight">
            ₹{totalMonthly.toLocaleString('en-IN')}
            <span className="text-xs text-[#8B949E] ml-2 font-normal">
              (${totalMonthly.toFixed(2)} USDC / mo)
            </span>
          </div>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#00D09C] hover:bg-[#00e2ab] text-[#0A261D] font-bold text-xs transition shadow-lg shadow-[#00D09C]/20"
        >
          <Plus className="w-4 h-4" />
          <span>Start New SIP</span>
        </button>
      </div>

      {toastMsg && (
        <div className="p-3 bg-emerald-950/70 border border-[#00D09C]/50 rounded-xl text-xs text-[#00D09C] flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Active SIPs list matching Groww Screenshot 2026-09-11 203335.png */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white tracking-tight">
            Active SIPs ({sips.length})
          </h3>
          <span className="text-xs text-[#8B949E]">Sort by: Due Date</span>
        </div>

        <div className="space-y-4">
          {sips.map((sip) => (
            <div
              key={sip.id}
              className="bg-[#181A20] border border-[#262A34] rounded-xl p-5 shadow-lg space-y-4 transition hover:border-[#2D313E]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`h-11 w-11 rounded-xl flex items-center justify-center font-bold text-sm ${sip.iconBg}`}
                  >
                    {sip.iconLetter}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{sip.name}</h4>
                    <span className="text-base font-mono font-bold text-white block mt-0.5">
                      ₹{sip.amount}{' '}
                      <span className="text-xs text-[#8B949E] font-normal">
                        (${sip.amount} USDC) • {sip.frequency}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Due Date Badge matching Groww */}
                <div className="flex items-center gap-3">
                  <div className="border border-[#262A34] bg-[#14161C] rounded-lg px-3 py-1.5 text-center min-w-[54px]">
                    <span className="block text-sm font-bold text-white font-mono leading-tight">
                      {sip.nextDueDate.split(' ')[0]}
                    </span>
                    <span className="block text-[10px] text-[#8B949E] uppercase font-semibold">
                      {sip.nextDueDate.split(' ')[1]}
                    </span>
                  </div>

                  <button
                    onClick={() => togglePause(sip.id)}
                    className="p-2 rounded-lg bg-[#262A34] hover:bg-[#323642] text-[#8B949E] hover:text-white transition"
                    title={sip.status === 'Active' ? 'Pause SIP' : 'Resume SIP'}
                  >
                    {sip.status === 'Active' ? (
                      <Pause className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Play className="w-4 h-4 text-[#00D09C]" />
                    )}
                  </button>
                </div>
              </div>

              {/* Status Note matching Groww Screenshot */}
              <div className="bg-[#14161C] rounded-lg px-3.5 py-2 text-xs text-[#8B949E] flex items-center justify-between border border-[#262A34]/50">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00D09C]" />
                  Execution date will be next scheduled slot · Automated via Jupiter routing on Solana
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    sip.status === 'Active'
                      ? 'bg-emerald-500/15 text-[#00D09C]'
                      : 'bg-amber-500/15 text-amber-400'
                  }`}
                >
                  {sip.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create SIP Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-[#181A20] border border-[#262A34] rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#262A34]">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#00D09C]" />
                <h3 className="text-base font-bold text-white">Start Automated SIP</h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-xs text-[#8B949E] hover:text-white px-2 py-1 rounded hover:bg-[#262A34]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[#8B949E] block mb-1 font-semibold">Select Basket or Stock</label>
                <select
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262A34] rounded-lg p-2.5 text-white focus:border-[#00D09C] focus:outline-none"
                >
                  <optgroup label="Thematic Baskets">
                    {POPULAR_BASKETS.map((b) => (
                      <option key={b.id} value={b.ticker}>
                        {b.name} ({b.ticker})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="US Tokenized Equities">
                    {Object.values(GROWW_STOCKS).map((s) => (
                      <option key={s.symbol} value={s.symbol}>
                        {s.name} ({s.symbol})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="text-[#8B949E] block mb-1 font-semibold">Amount (USDC)</label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262A34] rounded-lg p-2.5 text-white font-mono focus:border-[#00D09C] focus:outline-none"
                  placeholder="250"
                />
              </div>

              <div>
                <label className="text-[#8B949E] block mb-1 font-semibold">Frequency</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Daily', 'Weekly', 'Monthly'] as const).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setNewFreq(freq)}
                      className={`py-2 rounded-lg font-semibold transition ${
                        newFreq === freq
                          ? 'bg-[#00D09C] text-[#0A261D]'
                          : 'bg-[#121212] border border-[#262A34] text-[#8B949E] hover:text-white'
                      }`}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleCreateSIP}
              className="w-full py-3 rounded-lg bg-[#00D09C] hover:bg-[#00e2ab] text-[#0A261D] font-bold text-sm transition shadow-lg shadow-[#00D09C]/20"
            >
              Confirm & Authorize SIP on Solana
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
