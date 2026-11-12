/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Dealer } from '../../services/dealerService';
import { customerPrice, formatRand, Sale, SalesAgent, saveSale } from '../../services/salesService';

const fieldCls =
  'w-full rounded-md border border-white/10 bg-[#0d0d0d] px-2 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-[#CF9F52]';

const today = () => new Date().toISOString().slice(0, 10);
const money = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0);

/**
 * The sale on a won enquiry (admin only): agent, FORGED's price, the dealership's markup, sets, the commission FORGED
 * owes the dealership (pre-filled from its rate per set, editable), and whether that commission is paid.
 */
export const SaleForm: React.FC<{
  leadId: string;
  dealer: Dealer | undefined;
  agents: SalesAgent[];
  sale: Sale | undefined;
  onSaved: (sale: Sale) => void;
}> = ({ leadId, dealer, agents, sale, onSaved }) => {
  const rate = Number(dealer?.commission_per_set_zar ?? 0) || 0;
  const [f, setF] = useState({
    agent_id: sale?.agent_id ?? '',
    sold_on: sale?.sold_on ?? today(),
    sets: String(sale?.sets ?? 1),
    forged: sale ? String(sale.forged_price_zar) : '',
    markup: sale ? String(sale.dealer_markup_zar) : '',
    commission: sale ? String(sale.commission_zar) : String(rate),
    paid: sale?.commission_paid ?? false,
    notes: sale?.notes ?? ''
  });
  const [commissionTouched, setCommissionTouched] = useState(Boolean(sale));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const onSets = (v: string) => {
    const n = Math.max(1, Math.round(Number(v) || 1));
    // Until the commission is typed by hand, it follows the dealership's rate × sets
    set(commissionTouched ? { sets: v } : { sets: v, commission: String(rate * n) });
  };

  const total = customerPrice({ forged_price_zar: money(f.forged), dealer_markup_zar: money(f.markup) });
  const myAgents = agents.filter((a) => dealer && a.dealer_id === dealer.id && (a.active || a.id === f.agent_id));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveSale({
        id: sale?.id,
        lead_id: leadId,
        dealer_id: dealer?.id ?? null,
        agent_id: f.agent_id || null,
        sold_on: f.sold_on || today(),
        sets: Math.max(1, Math.round(Number(f.sets) || 1)),
        forged_price_zar: money(f.forged),
        dealer_markup_zar: money(f.markup),
        commission_zar: dealer ? money(f.commission) : 0,
        commission_paid: f.paid,
        commission_paid_on: sale?.commission_paid_on ?? null,
        notes: f.notes
      });
      onSaved(saved);
      setSavedAt(new Date().toLocaleTimeString('en-ZA', { timeStyle: 'short' }));
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="mt-3 w-full rounded-lg border border-[#CF9F52]/30 bg-[#CF9F52]/5 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#E8C37D]">{sale ? 'Sale' : 'Record the sale'}</span>
        <span className="text-xs text-neutral-300">
          Customer pays <strong className="text-white">{formatRand(total)}</strong>
          {dealer ? ` · ${dealer.name}` : ' · sold by FORGED'}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-[11px] text-neutral-400">
          Agent
          <select value={f.agent_id} onChange={(e) => set({ agent_id: e.target.value })} disabled={!dealer} className={fieldCls}>
            <option value="">{dealer ? 'No agent' : 'Assign a dealership first'}</option>
            {myAgents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.active ? '' : ' (off)'}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-neutral-400">
          Sold on
          <input type="date" value={f.sold_on} onChange={(e) => set({ sold_on: e.target.value })} className={fieldCls} />
        </label>
        <label className="text-[11px] text-neutral-400">
          Sets
          <input type="number" min={1} max={100} value={f.sets} onChange={(e) => onSets(e.target.value)} className={fieldCls} />
        </label>
        <label className="text-[11px] text-neutral-400">
          FORGED price (R)
          <input inputMode="decimal" required value={f.forged} onChange={(e) => set({ forged: e.target.value })} placeholder="75000" className={fieldCls} />
        </label>
        <label className="text-[11px] text-neutral-400">
          Dealer markup (R)
          <input inputMode="decimal" value={f.markup} onChange={(e) => set({ markup: e.target.value })} placeholder="0" disabled={!dealer} className={fieldCls} />
        </label>
        <label className="text-[11px] text-neutral-400">
          Commission (R)
          <input
            inputMode="decimal"
            value={dealer ? f.commission : '0'}
            onChange={(e) => {
              setCommissionTouched(true);
              set({ commission: e.target.value });
            }}
            disabled={!dealer}
            className={fieldCls}
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={f.paid} onChange={(e) => set({ paid: e.target.checked })} disabled={!dealer} />
          Commission paid
        </label>
        <input value={f.notes} maxLength={2000} onChange={(e) => set({ notes: e.target.value })} placeholder="Sale notes (invoice no., …)" aria-label="Sale notes" className={`${fieldCls} min-w-[12rem] flex-1`} />
        <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-md bg-[#CF9F52] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-black hover:bg-[#E8C37D] disabled:opacity-50">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {sale ? 'Save sale' : 'Record sale'}
        </button>
        {savedAt && !error && <span className="text-[11px] text-emerald-300">Saved {savedAt}</span>}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </form>
  );
};
