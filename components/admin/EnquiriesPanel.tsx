/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, Mail, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import {
  assignLead,
  Dealer,
  LEAD_STATUSES,
  LeadStatus,
  listDealers,
  updateLeadProgress
} from '../../services/dealerService';
import { listAgents, listSales, Sale, SalesAgent } from '../../services/salesService';
import { SaleForm } from './SaleForm';

interface Lead {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  message: string | null;
  consultation: boolean;
  config_code: string | null;
  configuration: Record<string, string> | null;
  region: string | null;
  source: 'enquiry' | 'pdf' | null;
  created_at: string;
  dealer_id: string | null;
  status: LeadStatus;
  dealer_notes: string | null;
}

const selectCls = 'rounded-md border border-white/10 bg-[#0d0d0d] px-2 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-[#CF9F52]';

/** Quotes a CSV cell; visitor text that a spreadsheet would run as a formula (= @ tab CR, or + -
 * not followed by a digit) is prefixed with ' (CSV injection). Phone numbers like +27 82… stay as
 * they are. */
const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  if (/^[=@\t\r]/.test(s) || /^[+-](?![\d\s(])/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/**
 * Enquiries sent from the configurator (public.leads), newest first.
 * mode 'admin' (FORGED): every enquiry, assign to a dealership, delete.
 * mode 'dealer': row-level security returns only the enquiries assigned to the signed-in dealership; they can
 * track status and notes but not delete or reassign.
 */
export const EnquiriesPanel: React.FC<{ mode?: 'admin' | 'dealer' }> = ({ mode = 'admin' }) => {
  const isAdmin = mode === 'admin';
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [filter, setFilter] = useState<string>('all'); // all | unassigned | <dealer id>
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Admin only: sales recorded on won enquiries and the dealerships' agents (null until loaded; an error string if
  // the sales migration is not applied yet, so the enquiries still work)
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [salesError, setSalesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(500);
      if (err) setError(err.message);
      else setLeads((data ?? []) as Lead[]);
    } catch (e) {
      // a network failure throws instead of returning an error: say so rather than sit on "Loading…"
      setError((e as Error).message || 'Could not load the enquiries. Check your connection and refresh.');
    }
    if (isAdmin) {
      listDealers().then(setDealers).catch(() => setDealers([]));
      Promise.all([listSales(), listAgents()])
        .then(([s, a]) => {
          setSales(s);
          setAgents(a);
          setSalesError(null);
        })
        .catch((e: Error) => {
          setSales(null);
          setSalesError(e.message);
        });
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const patchLocal = (id: string, patch: Partial<Lead>) => setLeads((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const run = async (fn: () => Promise<void>, id: string, patch: Partial<Lead>) => {
    setError(null);
    try {
      await fn();
      patchLocal(id, patch);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const dealerName = (id: string | null) => dealers.find((d) => d.id === id)?.name ?? 'Unknown dealership';
  const shown = leads.filter((l) => filter === 'all' || (filter === 'unassigned' ? !l.dealer_id : l.dealer_id === filter));

  const remove = async (lead: Lead) => {
    if (!window.confirm(`Delete the enquiry from ${lead.name || lead.email}? This cannot be undone.`)) return;
    setError(null);
    try {
      const { error: err } = await supabase.from('leads').delete().eq('id', lead.id);
      if (err) setError(err.message);
      else setLeads((l) => l.filter((x) => x.id !== lead.id));
    } catch (e) {
      // a network failure throws instead of returning an error: show it, and keep the enquiry in the list
      setError((e as Error).message || 'Could not delete the enquiry. Check your connection and try again.');
    }
  };

  const exportCsv = () => {
    const head = ['Received', 'Status', 'Dealership', 'Type', 'Name', 'Email', 'Phone', 'Wants consultation', 'Car', 'Paint', 'Wheel', 'Size', 'Finish', 'Region', 'Code', 'Message'];
    const rows = shown.map((l) => [
      new Date(l.created_at).toLocaleString('en-ZA'),
      l.status,
      l.dealer_id ? dealerName(l.dealer_id) : '',
      l.source === 'pdf' ? 'PDF download' : 'Enquiry',
      l.name,
      l.email,
      l.phone,
      l.consultation ? 'yes' : 'no',
      l.configuration?.car,
      l.configuration?.paint,
      l.configuration?.wheel,
      l.configuration?.size,
      l.configuration?.finish,
      l.region,
      l.config_code,
      l.message
    ]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `forgedsa-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-neutral-400">
          {loading ? 'Loading…' : `${shown.length} enquir${shown.length === 1 ? 'y' : 'ies'}`}{' '}
          {isAdmin ? 'from the configurator (enquiry form and PDF downloads), newest first.' : 'assigned to your dealership, newest first.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by dealership" className={selectCls}>
              <option value="all">All enquiries</option>
              <option value="unassigned">Not assigned (FORGED)</option>
              {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <button onClick={load} className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-widest text-neutral-300 hover:border-white/30">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!shown.length}
            className="flex items-center gap-2 rounded-md bg-[#CF9F52] px-3 py-2 text-xs font-bold uppercase tracking-widest text-black hover:bg-[#E8C37D] disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>
      {error && <p className="mb-4 text-xs text-red-400">{error}</p>}
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-[#CF9F52] mx-auto mt-10" />
      ) : !shown.length ? (
        <p className="text-sm text-neutral-500 mt-6">
          {isAdmin ? 'No enquiries here yet. They appear as soon as a customer presses Send on the enquiry form.' : 'Nothing assigned to your dealership yet. FORGED will assign enquiries to you and they will show up here.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((l) => {
            const c = l.configuration ?? {};
            return (
              <li key={l.id} className="rounded-xl border border-white/10 bg-[#0d0d0d] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-white font-semibold">
                      {l.name || l.email}
                      <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-300">
                        {l.source === 'pdf' ? 'PDF download' : 'Enquiry'}
                      </span>
                      {l.consultation && (
                        <span className="ml-2 rounded-full bg-[#CF9F52]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#E8C37D]">
                          Wants a consultation
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-neutral-400">
                      {new Date(l.created_at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
                      {l.region ? ` · ${l.region.toUpperCase()}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`mailto:${l.email}?subject=${encodeURIComponent('Your FORGEDSA enquiry')}`}
                      className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-200 hover:border-[#CF9F52]"
                    >
                      <Mail className="w-3.5 h-3.5" /> Reply
                    </a>
                    {l.config_code && (
                      <a
                        href={`/?config=${encodeURIComponent(l.config_code)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-200 hover:border-[#CF9F52]"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Open build
                      </a>
                    )}
                    {isAdmin && (
                      <button onClick={() => remove(l)} aria-label="Delete enquiry" className="rounded-md border border-white/10 px-2 py-1.5 text-neutral-400 hover:text-red-400 hover:border-red-400/50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="text-neutral-300">
                    <a href={`mailto:${l.email}`} className="hover:text-white">{l.email}</a>
                    {l.phone && <span className="text-neutral-500"> · <a href={`tel:${l.phone}`} className="hover:text-white">{l.phone}</a></span>}
                  </div>
                  <div className="text-neutral-400">
                    {[c.car, c.paint, c.wheel && `${c.wheel} ${c.size ?? ''}`.trim(), c.finish].filter(Boolean).join(' · ')}
                    {l.config_code && <span className="font-mono text-neutral-500"> · {l.config_code}</span>}
                  </div>
                </div>
                {l.message && <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-300">{l.message}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <label className="flex items-center gap-2 text-xs text-neutral-400">
                    Status
                    <select
                      value={l.status}
                      onChange={(e) => run(() => updateLeadProgress(l.id, { status: e.target.value as LeadStatus }), l.id, { status: e.target.value as LeadStatus })}
                      className={selectCls}
                    >
                      {LEAD_STATUSES.map((st) => <option key={st} value={st}>{st[0].toUpperCase() + st.slice(1)}</option>)}
                    </select>
                  </label>
                  {isAdmin && (
                    <label className="flex items-center gap-2 text-xs text-neutral-400">
                      Dealership
                      <select
                        value={l.dealer_id ?? ''}
                        onChange={(e) => run(() => assignLead(l.id, e.target.value || null), l.id, { dealer_id: e.target.value || null })}
                        className={selectCls}
                      >
                        <option value="">FORGED (not assigned)</option>
                        {dealers.filter((d) => d.active || d.id === l.dealer_id).map((d) => (
                          <option key={d.id} value={d.id}>{d.name}{d.active ? '' : ' (off)'}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <NotesBox lead={l} onSave={(text) => run(() => updateLeadProgress(l.id, { dealer_notes: text || null }), l.id, { dealer_notes: text || null })} />
                </div>
                {isAdmin && l.status === 'won' && (salesError ? (
                  <p className="mt-3 text-xs text-amber-300">{salesError}</p>
                ) : sales && (() => {
                  const sale = sales.find((x) => x.lead_id === l.id);
                  return (
                    <SaleForm
                      key={`${l.id}-${sale?.id ?? 'new'}-${l.dealer_id ?? 'forged'}-${dealers.length}`}
                      leadId={l.id}
                      dealer={dealers.find((d) => d.id === l.dealer_id)}
                      agents={agents}
                      sale={sale}
                      onSaved={(saved) => setSales((all) => [saved, ...(all ?? []).filter((x) => x.id !== saved.id)])}
                    />
                  );
                })())}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/** Free-text notes on an enquiry, saved when the box loses focus. */
const NotesBox: React.FC<{ lead: Lead; onSave: (text: string) => void }> = ({ lead, onSave }) => {
  const [text, setText] = useState(lead.dealer_notes ?? '');
  return (
    <input
      value={text}
      maxLength={2000}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== (lead.dealer_notes ?? '') && onSave(text.trim())}
      placeholder="Notes (called, quote sent, …)"
      aria-label="Notes"
      className={`${selectCls} min-w-[14rem] flex-1`}
    />
  );
};
