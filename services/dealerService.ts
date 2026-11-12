/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';

/** Dealerships and the enquiries assigned to them (supabase/migrations/20261111120000_dealers.sql). */

export interface Dealer {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  /** Rand FORGED pays per wheel set sold (20261112140000_sales_agents_and_sales.sql); missing until it is applied. */
  commission_per_set_zar?: number | string | null;
}

export interface DealerUser {
  email: string;
  dealer_id: string;
}

export const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** The dealership the signed-in user belongs to, or null (not a dealer, dealership switched off, or no session). */
export async function getMyDealer(): Promise<Dealer | null> {
  const { data, error } = await supabase.rpc('my_dealer');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Dealer[];
  return rows[0] ?? null;
}

// ----- FORGED admin only (row-level security refuses everyone else) -----

export async function listDealers(): Promise<Dealer[]> {
  const { data, error } = await supabase.from('dealers').select('*').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Dealer[];
}

export async function saveDealer(d: Partial<Dealer> & { name: string }): Promise<void> {
  const row = {
    name: d.name.trim(),
    city: d.city?.trim() || null,
    phone: d.phone?.trim() || null,
    email: d.email?.trim() || null,
    active: d.active ?? true
  };
  const { error } = d.id
    ? await supabase.from('dealers').update(row).eq('id', d.id)
    : await supabase.from('dealers').insert(row);
  if (error) throw new Error(error.message);
}

export async function deleteDealer(id: string): Promise<void> {
  // Their enquiries go back to FORGED (leads.dealer_id is set null), their logins are removed (cascade).
  const { error } = await supabase.from('dealers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listDealerUsers(): Promise<DealerUser[]> {
  const { data, error } = await supabase.from('dealer_users').select('email, dealer_id').order('email');
  if (error) throw new Error(error.message);
  return (data ?? []) as DealerUser[];
}

export async function addDealerUser(email: string, dealerId: string): Promise<void> {
  const { error } = await supabase.from('dealer_users').insert({ email: email.trim().toLowerCase(), dealer_id: dealerId });
  if (error) throw new Error(error.code === '23505' ? 'That email already belongs to a dealership.' : error.message);
}

export async function removeDealerUser(email: string): Promise<void> {
  const { error } = await supabase.from('dealer_users').delete().eq('email', email);
  if (error) throw new Error(error.message);
}

/** Hands an enquiry to a dealership (or back to FORGED with null). */
export async function assignLead(leadId: string, dealerId: string | null): Promise<void> {
  const { error } = await supabase.from('leads').update({ dealer_id: dealerId }).eq('id', leadId);
  if (error) throw new Error(error.message);
}

// ----- FORGED admin or the assigned dealer -----

export async function updateLeadProgress(leadId: string, patch: { status?: LeadStatus; dealer_notes?: string | null }): Promise<void> {
  const { error } = await supabase.from('leads').update(patch).eq('id', leadId);
  if (error) throw new Error(error.message);
}
