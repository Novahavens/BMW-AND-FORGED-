/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, UserMinus } from 'lucide-react';
import {
  addDealerUser,
  Dealer,
  DealerUser,
  deleteDealer,
  listDealers,
  listDealerUsers,
  removeDealerUser,
  saveDealer
} from '../../services/dealerService';
import { listAgents, SalesAgent } from '../../services/salesService';
import { DealerSalesSetup } from './DealerSalesSetup';

const inputCls =
  'w-full bg-[#0d0d0d] border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#CF9F52]';

/** FORGED admin: add dealerships, switch them off, and say which emails may sign in at /dealer for each. */
export const DealersPanel: React.FC = () => {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [users, setUsers] = useState<DealerUser[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [salesSetupError, setSalesSetupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', city: '', phone: '', email: '' });
  const [newLogin, setNewLogin] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, u] = await Promise.all([listDealers(), listDealerUsers()]);
      setDealers(d);
      setUsers(u);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    // Agents load on their own, so the dealers still show before the sales migration is applied
    try {
      setAgents(await listAgents());
      setSalesSetupError(null);
    } catch (e) {
      setAgents([]);
      setSalesSetupError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    act(async () => {
      await saveDealer({ name: draft.name, city: draft.city, phone: draft.phone, email: draft.email });
      setDraft({ name: '', city: '', phone: '', email: '' });
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-400">
        Dealerships see only the enquiries you assign to them (Enquiries tab). They cannot change the catalogue, prices or
        finishes: those stay with FORGED.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {salesSetupError && <p className="text-xs text-amber-300">{salesSetupError}</p>}

      <form onSubmit={create} className="grid gap-3 rounded-xl border border-white/10 bg-[#0d0d0d] p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_2fr_auto]">
        <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Dealership name" aria-label="Dealership name" className={inputCls} />
        <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="City" aria-label="City" className={inputCls} />
        <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="Phone" aria-label="Phone" className={inputCls} />
        <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="Contact email" aria-label="Contact email" className={inputCls} />
        <button type="submit" className="flex items-center justify-center gap-2 rounded-md bg-[#CF9F52] px-4 py-2 text-xs font-bold uppercase tracking-widest text-black hover:bg-[#E8C37D]">
          <Plus className="w-4 h-4" /> Add
        </button>
      </form>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-[#CF9F52] mx-auto mt-10" />
      ) : !dealers.length ? (
        <p className="text-sm text-neutral-500">No dealerships yet. Add one above, then add the emails of the people who will sign in for it.</p>
      ) : (
        <ul className="space-y-3">
          {dealers.map((d) => {
            const mine = users.filter((u) => u.dealer_id === d.id);
            return (
              <li key={d.id} className="rounded-xl border border-white/10 bg-[#0d0d0d] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-white font-semibold">
                      {d.name}
                      {!d.active && <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-300">Switched off</span>}
                    </div>
                    <div className="mt-1 text-xs text-neutral-400">{[d.city, d.phone, d.email].filter(Boolean).join(' · ') || 'No contact details'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(() => saveDealer({ ...d, active: !d.active }))}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-200 hover:border-[#CF9F52]"
                    >
                      {d.active ? 'Switch off' : 'Switch on'}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete ${d.name}? Its enquiries go back to FORGED and its logins stop working. Switch it off instead to keep the record.`)) act(() => deleteDealer(d.id));
                      }}
                      aria-label={`Delete ${d.name}`}
                      className="rounded-md border border-white/10 px-2 py-1.5 text-neutral-400 hover:text-red-400 hover:border-red-400/50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {!salesSetupError && <DealerSalesSetup dealer={d} agents={agents.filter((a) => a.dealer_id === d.id)} act={act} />}

                <div className="mt-4 border-t border-white/10 pt-3">
                  <div className="mb-2 text-[11px] uppercase tracking-widest text-neutral-500">Can sign in at /dealer</div>
                  <ul className="mb-3 flex flex-wrap gap-2">
                    {mine.length === 0 && <li className="text-xs text-neutral-500">No logins yet.</li>}
                    {mine.map((u) => (
                      <li key={u.email} className="flex items-center gap-2 rounded-full border border-white/10 py-1 pl-3 pr-1 text-xs text-neutral-200">
                        {u.email}
                        <button onClick={() => act(() => removeDealerUser(u.email))} aria-label={`Remove ${u.email}`} className="rounded-full p-1 text-neutral-400 hover:text-red-400">
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const email = (newLogin[d.id] ?? '').trim();
                      if (email) act(async () => { await addDealerUser(email, d.id); setNewLogin((n) => ({ ...n, [d.id]: '' })); });
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="email"
                      value={newLogin[d.id] ?? ''}
                      onChange={(e) => setNewLogin((n) => ({ ...n, [d.id]: e.target.value }))}
                      placeholder="person@dealership.co.za"
                      aria-label={`Add a login for ${d.name}`}
                      className={inputCls}
                    />
                    <button type="submit" className="rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-widest text-neutral-200 hover:border-[#CF9F52]">Add login</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
