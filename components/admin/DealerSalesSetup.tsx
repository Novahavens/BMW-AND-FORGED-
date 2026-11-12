/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Dealer } from '../../services/dealerService';
import { deleteAgent, saveAgent, SalesAgent, setDealerCommission } from '../../services/salesService';

const inputCls =
  'w-full bg-[#0d0d0d] border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#CF9F52]';

/**
 * Inside a dealership's card in the Dealers tab: the rand FORGED pays it per wheel set, and its sales agents.
 * `act` is the panel's runner (shows the error, reloads on success).
 */
export const DealerSalesSetup: React.FC<{
  dealer: Dealer;
  agents: SalesAgent[];
  act: (fn: () => Promise<void>) => void;
}> = ({ dealer, agents, act }) => {
  const saved = Number(dealer.commission_per_set_zar ?? 0) || 0;
  const [rate, setRate] = useState(String(saved));
  const [draft, setDraft] = useState({ name: '', email: '', phone: '' });
  useEffect(() => setRate(String(saved)), [saved]);

  const saveRate = () => {
    const n = Number(rate.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n === saved) return;
    act(() => setDealerCommission(dealer.id, n));
  };

  return (
    <div className="mt-4 grid gap-4 border-t border-white/10 pt-3 lg:grid-cols-[14rem_1fr]">
      <label className="block">
        <span className="mb-2 block text-[11px] uppercase tracking-widest text-neutral-500">Commission per set (R)</span>
        <input
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={saveRate}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={`Commission per set for ${dealer.name}, in rand`}
          className={inputCls}
        />
        <span className="mt-1 block text-[11px] text-neutral-500">New sales copy this amount. Past sales keep theirs.</span>
      </label>

      <div>
        <div className="mb-2 text-[11px] uppercase tracking-widest text-neutral-500">Sales agents</div>
        <ul className="mb-3 space-y-1">
          {agents.length === 0 && <li className="text-xs text-neutral-500">No agents yet.</li>}
          {agents.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-1.5 text-xs">
              <span className={a.active ? 'text-neutral-200' : 'text-neutral-500 line-through'}>
                {a.name}
                <span className="text-neutral-500">{[a.email, a.phone].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
              </span>
              <span className="flex gap-2">
                <button onClick={() => act(() => saveAgent({ ...a, active: !a.active }))} className="text-neutral-400 hover:text-white">
                  {a.active ? 'Switch off' : 'Switch on'}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Remove ${a.name}? Their past sales are kept without an agent.`)) act(() => deleteAgent(a.id));
                  }}
                  aria-label={`Remove ${a.name}`}
                  className="text-neutral-400 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.name.trim()) return;
            act(async () => {
              await saveAgent({ dealer_id: dealer.id, ...draft });
              setDraft({ name: '', email: '', phone: '' });
            });
          }}
          className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]"
        >
          <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Agent name" aria-label={`New agent name for ${dealer.name}`} className={inputCls} />
          <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="Email" aria-label="Agent email" className={inputCls} />
          <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="Phone" aria-label="Agent phone" className={inputCls} />
          <button type="submit" className="flex items-center justify-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-widest text-neutral-200 hover:border-[#CF9F52]">
            <Plus className="w-3.5 h-3.5" /> Agent
          </button>
        </form>
      </div>
    </div>
  );
};
