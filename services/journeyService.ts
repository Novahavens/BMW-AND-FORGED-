/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';
import { currentUserId } from './authService';
import { PaintColor } from '../types';

/** Everything needed to rebuild a configuration. */
export interface SavedConfiguration {
  carId: string;
  paintId: string;
  wheelId: string;
  finishId: string;
  size: string;
  regionId: string;
}

const LOCAL_CODES = 'forged_saved_configurations';
const LOCAL_LEADS = 'forged_enquiries';

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
};
const writeLocal = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: the code still works on this page */
  }
};

// No 0/O or 1/I, so codes read cleanly over the phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newConfigCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
};

export const configKey = (c: SavedConfiguration) =>
  [c.carId, c.paintId, c.wheelId, c.finishId, c.size].join('|');

/** A configuration code: usable at once in this browser; `shared` says whether the copy every
 * device can open (Supabase) was written; `stamped` whether that copy carries the account columns
 * (the signed-in customer's id and the build's name), i.e. whether it is in their garage. False when
 * the row went in without them (accounts migration not applied) or was not written at all. */
export interface SavedCode {
  code: string;
  shared: Promise<boolean>;
  stamped: Promise<boolean>;
}

const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });

/** The columns the customer-accounts migration (20261110150000_customer_accounts.sql) adds. */
type AccountColumn = 'user_id' | 'name';

/**
 * The same row without the given account columns, for a live database the migration has not reached
 * yet. The caller names the keys because `leads` already has a `name` column (the visitor's) that must
 * stay; only `saved_configurations.name` is new.
 */
const withoutAccountColumns = <T extends object, K extends AccountColumn>(row: T, ...keys: K[]): Omit<T, K> => {
  const rest = { ...row } as Record<string, unknown>;
  for (const key of keys) delete rest[key];
  return rest as Omit<T, K>;
};

/**
 * True when an insert failed only because the live schema lacks the account columns (the migration is
 * written but not applied): PostgREST answers PGRST204 ("Could not find the 'user_id' column of
 * 'saved_configurations' in the schema cache"), Postgres 42703 (undefined_column); the message is
 * matched as a fallback in case the code is missing.
 */
const isMissingAccountColumn = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false;
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  return /user_id|\bname\b.*column|column.*(user_id|name)/i.test(error.message ?? '');
};

// Set the first time a write had to drop the account columns: the live database has not had the
// accounts migration, so nothing saved from this page can land in a garage.
let accountColumnsStripped = false;

/** True once a write in this page found the live schema without the account columns (user_id, name). */
export const accountColumnsMissing = (): boolean => accountColumnsStripped;

/**
 * Stores the configuration under a new code. The code is returned at once (kept in this browser), so
 * the summary never waits on the network; the shared copy is written in the background, with retries,
 * and `shared` resolves false when it could not be (the caller then says the link only works here).
 * A signed-in customer's id (from authService's cached session, never awaited) goes on the row, so the
 * build is in their garage; `name` is the garage's label for it. The `payload` shape is unchanged.
 * Until the accounts migration is applied the live table has neither column, so a signed-in browser
 * (an admin at /admin included) would never get a shared code: that failure drops the two keys and
 * the plain row is written instead, so the code still opens on every device.
 */
export function saveConfiguration(config: SavedConfiguration, name?: string): SavedCode {
  const code = newConfigCode();
  const local = readLocal<Record<string, SavedConfiguration>>(LOCAL_CODES, {});
  local[code] = config;
  writeLocal(LOCAL_CODES, local);
  const userId = currentUserId();
  let row = { code, payload: config, ...(userId ? { user_id: userId } : {}), ...(name?.trim() ? { name: name.trim().slice(0, 80) } : {}) };
  let stripped = false;
  const shared = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { error } = await withTimeout(supabase.from('saved_configurations').insert(row), 8000);
        if (!error) return true;
        // No user_id/name columns yet: strip them for the remaining attempts (happens once, since the
        // stripped row no longer has them) and do not count it as a failed attempt
        if (('user_id' in row || 'name' in row) && isMissingAccountColumn(error)) {
          console.warn(`Saving configuration ${code}: the customer accounts migration is not applied yet, saving without user_id/name`);
          row = withoutAccountColumns(row, 'user_id', 'name');
          stripped = accountColumnsStripped = true;
          attempt--;
          continue;
        }
        console.warn(`Saving configuration ${code} failed (attempt ${attempt + 1}):`, error.message);
        // The code exists already: on a retry, an earlier attempt that timed out here landed after all;
        // on the first try it is a clash (1 in 10^15): keep the local copy only
        if (error.code === '23505') return attempt > 0;
      } catch (err) {
        console.warn(`Saving configuration ${code} failed (attempt ${attempt + 1}):`, err);
      }
    }
    return false;
  })();
  // the row is in the customer's garage only if it was written with the id still on it
  const stamped = shared.then((ok) => ok && !!userId && !stripped);
  return { code, shared, stamped };
}

/** A configuration found by its code, and where: this browser's copy, or the shared copy every device opens. */
export interface FoundConfiguration {
  config: SavedConfiguration;
  source: 'local' | 'server';
}

const cleanCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The shared copy of a code from the server (null when there is none or it cannot be reached). */
async function fetchSharedConfiguration(clean: string): Promise<SavedConfiguration | null> {
  const { data, error } = await supabase.rpc('get_configuration', { p_code: clean });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as SavedConfiguration;
}

export async function findConfiguration(code: string): Promise<FoundConfiguration | null> {
  const clean = cleanCode(code);
  if (clean.length !== 10) return null;
  const local = readLocal<Record<string, SavedConfiguration>>(LOCAL_CODES, {})[clean];
  if (local) return { config: local, source: 'local' };
  const config = await fetchSharedConfiguration(clean);
  return config ? { config, source: 'server' } : null;
}

export async function loadConfiguration(code: string): Promise<SavedConfiguration | null> {
  return (await findConfiguration(code))?.config ?? null;
}

/** Whether the copy every device can open exists for a code made in this browser (its save may have failed). */
export async function isConfigurationShared(code: string): Promise<boolean> {
  return (await fetchSharedConfiguration(cleanCode(code))) !== null;
}

/** Drops the copy of a code kept in this browser (after the shared row was deleted from the garage). */
export function forgetLocalConfiguration(code: string) {
  const local = readLocal<Record<string, SavedConfiguration>>(LOCAL_CODES, {});
  if (!(code in local)) return;
  delete local[code];
  writeLocal(LOCAL_CODES, local);
}

export const shareUrl = (code: string) => `${window.location.origin}/?config=${code}`;

export interface Enquiry {
  /** Optional for PDF downloads. */
  name: string;
  email: string;
  phone?: string;
  message?: string;
  consultation: boolean;
  configCode?: string;
  configuration?: Record<string, string>;
  region?: string;
  /** 'pdf' when the contact details were given to download the summary PDF. */
  source?: 'enquiry' | 'pdf';
}

/** Contact details asked for before the summary PDF generates; remembered in this browser. */
export interface PdfContact {
  name: string;
  email: string;
  phone: string;
}
const LOCAL_PDF_CONTACT = 'forgedsa_pdf_contact';
export const rememberedPdfContact = (): PdfContact => ({ name: '', email: '', phone: '', ...readLocal<Partial<PdfContact>>(LOCAL_PDF_CONTACT, {}) });
export const rememberPdfContact = (c: PdfContact) => writeLocal(LOCAL_PDF_CONTACT, c);

export type EnquiryResult =
  | { status: 'sent' }
  /** Network or server trouble: kept in this browser, to be sent later. */
  | { status: 'saved-locally' }
  /** The server refused it (e.g. the rate limit): nothing stored, the message is for the visitor. */
  | { status: 'rejected'; message: string };

/** Sends an enquiry to Supabase; keeps a copy in this browser if that fails. A signed-in customer's
 * id goes on the lead (the `configuration` object n8n reads is unchanged). While the live `leads`
 * table has no `user_id` column (accounts migration not applied), the insert is retried once without
 * it, so the enquiry reaches the team instead of being kept in the browser. */
export async function submitEnquiry(enquiry: Enquiry): Promise<EnquiryResult> {
  const userId = currentUserId();
  const lead = {
    name: enquiry.name.trim() || null,
    email: enquiry.email,
    phone: enquiry.phone || null,
    message: enquiry.message || null,
    consultation: enquiry.consultation,
    config_code: enquiry.configCode || null,
    configuration: enquiry.configuration ?? null,
    region: enquiry.region ?? null,
    source: enquiry.source ?? 'enquiry',
    ...(userId ? { user_id: userId } : {})
  };
  let { error } = await supabase.from('leads').insert(lead);
  if (error && 'user_id' in lead && isMissingAccountColumn(error)) {
    console.warn('Enquiry: the customer accounts migration is not applied yet, sending without user_id');
    accountColumnsStripped = true;
    ({ error } = await supabase.from('leads').insert(withoutAccountColumns(lead, 'user_id')));
  }
  if (!error) return { status: 'sent' };
  // A deliberate refusal (the lead rate limit raises P0001 with a visitor-facing message, a check
  // constraint 23514) is shown, not hidden behind a "sent"
  if (error.code === 'P0001' || error.code === '23514' || /too many/i.test(error.message)) {
    return { status: 'rejected', message: error.code === 'P0001' ? error.message : 'This enquiry could not be accepted. Please check your details and try again.' };
  }
  console.warn('Enquiry kept in this browser:', error.message);
  // Kept for a retry only: at most five, and nothing older than 30 days (it is the visitor's own contact details)
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const kept = readLocal<{ at?: string }[]>(LOCAL_LEADS, []).filter((l) => !l.at || Date.parse(l.at) > cutoff).slice(0, 4);
  writeLocal(LOCAL_LEADS, [{ ...enquiry, at: new Date().toISOString() }, ...kept]);
  return { status: 'saved-locally' };
}

// ----------------------------------------------------
// Paint families (grouped by colour, like a manufacturer colour book)
// ----------------------------------------------------

export const PAINT_FAMILIES = ['Blacks & Greys', 'Whites & Silvers', 'Blues & Purples', 'Greens', 'Reds & Oranges', 'Yellows & Golds'] as const;
export type PaintFamily = (typeof PAINT_FAMILIES)[number];

// BMW names say the colour family more reliably than the swatch hex (lit, approximate samples that
// wash out greys and dark tones), so the name decides first; the hue is the fallback.
const FAMILY_BY_NAME: [RegExp, PaintFamily][] = [
  [/\bwhite\b/i, 'Whites & Silvers'],
  [/\b(black|grey|gray|grigio|nardo|sepia|thunder)\b/i, 'Blacks & Greys'],
  [/\b(blue|purple|orchid|thundernight|violet)\b/i, 'Blues & Purples'],
  [/\bgreen\b/i, 'Greens'],
  [/\b(yellow|gold|bronze)\b/i, 'Yellows & Golds'],
  [/\b(red|orange|ruby|wildberry|aventurin|aventurine)\b/i, 'Reds & Oranges']
];

export function paintFamily(paint: Pick<PaintColor, 'hex'> & Partial<Pick<PaintColor, 'name'>>): PaintFamily {
  const named = paint.name && FAMILY_BY_NAME.find(([re]) => re.test(paint.name!));
  if (named) return named[1];
  return hueFamily(paint.hex);
}

function hueFamily(hex: string): PaintFamily {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max !== min) {
    if (max === r) h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    h = (h * 60 + 360) % 360;
  }
  if (s < 0.14 || l < 0.1) return l > 0.62 ? 'Whites & Silvers' : 'Blacks & Greys';
  if (l > 0.85) return 'Whites & Silvers';
  if (h >= 170 && h < 290) return 'Blues & Purples';
  if (h >= 85 && h < 170) return 'Greens';
  if (h >= 42 && h < 85) return 'Yellows & Golds';
  return 'Reds & Oranges';
}
