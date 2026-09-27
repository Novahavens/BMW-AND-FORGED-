/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, Mail, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

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
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Enquiries sent from the configurator (public.leads, readable by admins only), newest first. */
export const EnquiriesPanel: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(500);
    if (err) setError(err.message);
    else setLeads((data ?? []) as Lead[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (lead: Lead) => {
    if (!window.confirm(`Delete the enquiry from ${lead.name || lead.email}? This cannot be undone.`)) return;
    const { error: err } = await supabase.from('leads').delete().eq('id', lead.id);
    if (err) setError(err.message);
    else setLeads((l) => l.filter((x) => x.id !== lead.id));
  };

  const exportCsv = () => {
    const head = ['Received', 'Type', 'Name', 'Email', 'Phone', 'Wants consultation', 'Car', 'Paint', 'Wheel', 'Size', 'Finish', 'Region', 'Code', 'Message'];
    const rows = leads.map((l) => [
      new Date(l.created_at).toLocaleString('en-ZA'),
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
          {loading ? 'Loading…' : `${leads.length} enquir${leads.length === 1 ? 'y' : 'ies'}`} from the configurator (enquiry form and PDF downloads), newest first.
        </p>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-widest text-neutral-300 hover:border-white/30">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!leads.length}
            className="flex items-center gap-2 rounded-md bg-[#CF9F52] px-3 py-2 text-xs font-bold uppercase tracking-widest text-black hover:bg-[#E8C37D] disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>
      {error && <p className="mb-4 text-xs text-red-400">{error}</p>}
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-[#CF9F52] mx-auto mt-10" />
      ) : !leads.length ? (
        <p className="text-sm text-neutral-500 mt-6">No enquiries yet. They appear here as soon as a customer presses Send on the enquiry form.</p>
      ) : (
        <ul className="space-y-3">
          {leads.map((l) => {
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
                    <button onClick={() => remove(l)} aria-label="Delete enquiry" className="rounded-md border border-white/10 px-2 py-1.5 text-neutral-400 hover:text-red-400 hover:border-red-400/50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
