/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Dealer, listDealers } from '../../services/dealerService';
import { customerPrice, deleteSale, formatRand, listAgents, listSales, Sale, SalesAgent, setCommissionPaid } from '../../services/salesService';

const selectCls = 'rounded-md border border-white/10 bg-[#0d0d0d] px-2 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-[#CF9F52]';
const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  if (/^[=@\t\r]/.test(s) || /^[+-](?![\d\s(])/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

interface Totals {
  count: number;
  sets: number;
  forged: number;
  markup: number;
  customer: number;
  commission: number;
  owed: number;
}
const sum = (rows: Sale[]): Totals =>
  rows.reduce<Totals>(
    (t, s) => ({
      count: t.count + 1,
      sets: t.sets + s.sets,
      forged: t.forged + s.forged_price_zar,
      markup: t.markup + s.dealer_markup_zar,
      customer: t.customer + customerPrice(s),
      commission: t.commission + s.commission_zar,
      owed: t.owed + (s.commission_paid ? 0 : s.commission_zar)
    }),
    { count: 0, sets: 0, forged: 0, markup: 0, customer: 0, commission: 0, owed: 0 }
  );

/**
 * FORGED admin: every sale recorded on a won enquiry, with totals by dealership and agent, the commission still owed,
 * and a CSV export. Sales are recorded in the Enquiries tab (set an enquiry to Won).
 */
export const SalesPanel: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dealerFilter, setDealerFilter] = useState('all'); // all | forged | <dealer id>
  const [agentFilter, setAgentFilter] = useState('all');
  const [month, setMonth] = useState(''); // '' = all time, else YYYY-MM
  const [owedOnly, setOwedOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d, a] = await Promise.all([listSales(), listDealers(), listAgents()]);
      setSales(s);
      setDealers(d);
      setAgents(a);
    } catch (e) {
      setError((e as Error).message || 'Could not load the sales. Check your connection and refresh.');
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const dealerName = (id: string | null) => (id ? dealers.find((d) => d.id === id)?.name ?? 'Removed dealership' : 'FORGED direct');
  const agentName = (id: string | null) => (id ? agents.find((a) => a.id === id)?.name ?? 'Removed agent' : '');
  const months = useMemo(() => Array.from(new Set(sales.map((s) => s.sold_on.slice(0, 7)))).sort().reverse(), [sales]);

  const shown = sales.filter(
    (s) =>
      (dealerFilter === 'all' || (dealerFilter === 'forged' ? !s.dealer_id : s.dealer_id === dealerFilter)) &&
      (agentFilter === 'all' || s.agent_id === agentFilter) &&
      (!month || s.sold_on.startsWith(month)) &&
      (!owedOnly || (!s.commission_paid && s.commission_zar > 0))
  );
  const total = sum(shown);
  const byDealer = Array.from(new Set<string | null>(shown.map((s) => s.dealer_id))).map((id) => ({ id, t: sum(shown.filter((s) => s.dealer_id === id)) }));
  const byAgent = Array.from(new Set<string | null>(shown.filter((s) => s.agent_id).map((s) => s.agent_id))).map((id) => ({
    id,
    dealer: agents.find((a) => a.id === id)?.dealer_id ?? null,
    t: sum(shown.filter((s) => s.agent_id === id))
  }));

  const act = async (fn: () => Promise<void>, after: (list: Sale[]) => Sale[]) => {
    setError(null);
    try {
      await fn();
      setSales(after);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const exportCsv = () => {
    const head = ['Sold on', 'Dealership', 'Agent', 'Sets', 'FORGED price (R)', 'Dealer markup (R)', 'Customer price (R)', 'Commission (R)', 'Commission paid', 'Paid on', 'Notes'];
    const rows = shown.map((s) => [
      s.sold_on,
      dealerName(s.dealer_id),
      agentName(s.agent_id),
      s.sets,
      s.forged_price_zar,
      s.dealer_markup_zar,
      customerPrice(s),
      s.commission_zar,
      s.commission_paid ? 'yes' : 'no',
      s.commission_paid_on ?? '',
      s.notes
    ]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `forgedsa-sales-${month || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Stat: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
    <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-3">
      <div className="text-[11px] uppercase tracking-widest text-neutral-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${accent ? 'text-[#E8C37D]' : 'text-white'}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-400">
          Sales are recorded in the Enquiries tab: set an enquiry to <strong className="text-neutral-200">Won</strong> and fill in the sale.
        </p>
        <div className="flex flex-wrap gap-2">
          <select value={dealerFilter} onChange={(e) => { setDealerFilter(e.target.value); setAgentFilter('all'); }} aria-label="Filter by dealership" className={selectCls}>
            <option value="all">All dealerships</option>
            <option value="forged">FORGED direct</option>
            {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} aria-label="Filter by agent" className={selectCls}>
            <option value="all">All agents</option>
            {agents.filter((a) => dealerFilter === 'all' || a.dealer_id === dealerFilter).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Filter by month" className={selectCls}>
            <option value="">All time</option>
            {months.map((m) => <option key={m} value={m}>{new Date(`${m}-01T00:00:00`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input type="checkbox" checked={owedOnly} onChange={(e) => setOwedOnly(e.target.checked)} /> Commission owed only
          </label>
          <button onClick={load} className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-widest text-neutral-300 hover:border-white/30">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={exportCsv} disabled={!shown.length} className="flex items-center gap-2 rounded-md bg-[#CF9F52] px-3 py-2 text-xs font-bold uppercase tracking-widest text-black hover:bg-[#E8C37D] disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-[#CF9F52] mx-auto mt-10" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Sales" value={String(total.count)} />
            <Stat label="Sets" value={String(total.sets)} />
            <Stat label="FORGED revenue" value={formatRand(total.forged)} />
            <Stat label="Dealer markup" value={formatRand(total.markup)} />
            <Stat label="Customer total" value={formatRand(total.customer)} />
            <Stat label="Commission owed" value={formatRand(total.owed)} accent />
          </div>

          {shown.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <SummaryTable title="By dealership" rows={byDealer.map(({ id, t }) => ({ key: id ?? 'forged', name: dealerName(id), t }))} />
              <SummaryTable title="By agent" rows={byAgent.map(({ id, dealer, t }) => ({ key: id ?? '', name: `${agentName(id)} · ${dealerName(dealer)}`, t }))} empty="No sales with an agent yet." />
            </div>
          )}

          {!shown.length ? (
            <p className="text-sm text-neutral-500">{sales.length ? 'No sales match these filters.' : 'No sales yet. Set an enquiry to Won in the Enquiries tab and record the sale there.'}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[56rem] text-left text-xs">
                <thead className="bg-white/5 text-[11px] uppercase tracking-widest text-neutral-500">
                  <tr>
                    {['Sold on', 'Dealership', 'Agent', 'Sets', 'FORGED', 'Markup', 'Customer', 'Commission', 'Paid', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s.id} className="border-t border-white/10 text-neutral-200">
                      <td className="px-3 py-2 whitespace-nowrap">{s.sold_on}</td>
                      <td className="px-3 py-2">{dealerName(s.dealer_id)}</td>
                      <td className="px-3 py-2">{agentName(s.agent_id) || <span className="text-neutral-500">None</span>}</td>
                      <td className="px-3 py-2">{s.sets}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatRand(s.forged_price_zar)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatRand(s.dealer_markup_zar)}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-semibold text-white">{formatRand(customerPrice(s))}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatRand(s.commission_zar)}</td>
                      <td className="px-3 py-2">
                        {s.commission_zar > 0 ? (
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={s.commission_paid}
                              onChange={(e) => {
                                const paid = e.target.checked;
                                const on = paid ? new Date().toISOString().slice(0, 10) : null;
                                act(() => setCommissionPaid(s.id, paid), (l) => l.map((x) => (x.id === s.id ? { ...x, commission_paid: paid, commission_paid_on: on } : x)));
                              }}
                              aria-label={`Commission paid for the sale on ${s.sold_on}`}
                            />
                            <span className="text-neutral-500">{s.commission_paid_on ?? ''}</span>
                          </label>
                        ) : (
                          <span className="text-neutral-500">n/a</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this sale? The enquiry stays; you can record the sale again.')) act(() => deleteSale(s.id), (l) => l.filter((x) => x.id !== s.id));
                          }}
                          aria-label={`Delete the sale on ${s.sold_on}`}
                          className="text-neutral-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const SummaryTable: React.FC<{ title: string; rows: { key: string; name: string; t: Totals }[]; empty?: string }> = ({ title, rows, empty }) => (
  <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-3">
    <div className="mb-2 text-[11px] uppercase tracking-widest text-neutral-500">{title}</div>
    {!rows.length ? (
      <p className="text-xs text-neutral-500">{empty}</p>
    ) : (
      <table className="w-full text-left text-xs">
        <thead className="text-neutral-500">
          <tr><th className="py-1 font-medium" /><th className="py-1 font-medium">Sets</th><th className="py-1 font-medium">Customer total</th><th className="py-1 font-medium">Commission</th><th className="py-1 font-medium">Owed</th></tr>
        </thead>
        <tbody>
          {rows.sort((a, b) => b.t.customer - a.t.customer).map(({ key, name, t }) => (
            <tr key={key} className="border-t border-white/10 text-neutral-200">
              <td className="py-1.5 pr-2">{name}</td>
              <td className="py-1.5">{t.sets}</td>
              <td className="py-1.5 whitespace-nowrap">{formatRand(t.customer)}</td>
              <td className="py-1.5 whitespace-nowrap">{formatRand(t.commission)}</td>
              <td className="py-1.5 whitespace-nowrap text-[#E8C37D]">{formatRand(t.owed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);
