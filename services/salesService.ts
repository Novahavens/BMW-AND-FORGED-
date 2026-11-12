/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';

/**
 * Sales agents (dealership staff), each dealership's commission per set, and sales recorded from won enquiries
 * (supabase/migrations/20261112140000_sales_agents_and_sales.sql). FORGED admin only: row-level security refuses
 * everyone else. Amounts are rand.
 */

export interface SalesAgent {
  id: string;
  dealer_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export interface Sale {
  id: string;
  lead_id: string | null;
  dealer_id: string | null;
  agent_id: string | null;
  sold_on: string;
  sets: number;
  forged_price_zar: number;
  dealer_markup_zar: number;
  commission_zar: number;
  commission_paid: boolean;
  commission_paid_on: string | null;
  notes: string | null;
  created_at: string;
}

export type SaleInput = Omit<Sale, 'id' | 'created_at'> & { id?: string };

/** Turns the "table/column does not exist" error into the step that fixes it. */
function explain(message: string): Error {
  if (/sales_agents|public\.sales\b|commission_per_set_zar/i.test(message) && /does not exist|schema cache|could not find/i.test(message)) {
    return new Error(
      'Sales tracking is not set up in the database yet: apply supabase/migrations/20261112140000_sales_agents_and_sales.sql.'
    );
  }
  return new Error(message);
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const toSale = (r: Record<string, unknown>): Sale => ({
  ...(r as unknown as Sale),
  sets: num(r.sets) || 1,
  forged_price_zar: num(r.forged_price_zar),
  dealer_markup_zar: num(r.dealer_markup_zar),
  commission_zar: num(r.commission_zar)
});

/** The customer's price: FORGED's price plus the dealership's markup. */
export const customerPrice = (s: Pick<Sale, 'forged_price_zar' | 'dealer_markup_zar'>) => s.forged_price_zar + s.dealer_markup_zar;

export const formatRand = (n: number) => `R ${Math.round(n).toLocaleString('en-ZA')}`;

// ----- commission per set on a dealership -----

export async function setDealerCommission(dealerId: string, perSetZar: number): Promise<void> {
  const value = Math.max(0, Math.round(perSetZar * 100) / 100);
  const { error } = await supabase.from('dealers').update({ commission_per_set_zar: value }).eq('id', dealerId);
  if (error) throw explain(error.message);
}

// ----- agents -----

export async function listAgents(): Promise<SalesAgent[]> {
  const { data, error } = await supabase.from('sales_agents').select('*').order('name');
  if (error) throw explain(error.message);
  return (data ?? []) as SalesAgent[];
}

export async function saveAgent(a: Partial<SalesAgent> & { name: string; dealer_id: string }): Promise<void> {
  const row = {
    dealer_id: a.dealer_id,
    name: a.name.trim(),
    email: a.email?.trim().toLowerCase() || null,
    phone: a.phone?.trim() || null,
    active: a.active ?? true
  };
  const { error } = a.id
    ? await supabase.from('sales_agents').update(row).eq('id', a.id)
    : await supabase.from('sales_agents').insert(row);
  if (error) throw explain(error.message);
}

export async function deleteAgent(id: string): Promise<void> {
  // Their sales are kept; the sale just loses its agent (sales.agent_id is set null).
  const { error } = await supabase.from('sales_agents').delete().eq('id', id);
  if (error) throw explain(error.message);
}

// ----- sales -----

export async function listSales(): Promise<Sale[]> {
  const { data, error } = await supabase.from('sales').select('*').order('sold_on', { ascending: false }).limit(2000);
  if (error) throw explain(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toSale);
}

/** Records or updates the sale for a won enquiry (one sale per enquiry). */
export async function saveSale(s: SaleInput): Promise<Sale> {
  const row = {
    lead_id: s.lead_id,
    dealer_id: s.dealer_id,
    agent_id: s.agent_id,
    sold_on: s.sold_on,
    sets: Math.max(1, Math.round(s.sets)),
    forged_price_zar: Math.max(0, s.forged_price_zar),
    dealer_markup_zar: Math.max(0, s.dealer_markup_zar),
    commission_zar: Math.max(0, s.commission_zar),
    commission_paid: s.commission_paid,
    commission_paid_on: s.commission_paid ? s.commission_paid_on ?? new Date().toISOString().slice(0, 10) : null,
    notes: s.notes?.trim() || null
  };
  const query = s.id
    ? supabase.from('sales').update(row).eq('id', s.id).select().single()
    : supabase.from('sales').insert(row).select().single();
  const { data, error } = await query;
  if (error) throw explain(error.code === '23505' ? 'This enquiry already has a sale recorded.' : error.message);
  return toSale(data as Record<string, unknown>);
}

export async function setCommissionPaid(saleId: string, paid: boolean): Promise<void> {
  const { error } = await supabase
    .from('sales')
    .update({ commission_paid: paid, commission_paid_on: paid ? new Date().toISOString().slice(0, 10) : null })
    .eq('id', saleId);
  if (error) throw explain(error.message);
}

export async function deleteSale(id: string): Promise<void> {
  const { error } = await supabase.from('sales').delete().eq('id', id);
  if (error) throw explain(error.message);
}
