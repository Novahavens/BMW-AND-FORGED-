/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';
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
 * device can open (Supabase) was written. */
export interface SavedCode {
  code: string;
  shared: Promise<boolean>;
}

const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });

/**
 * Stores the configuration under a new code. The code is returned at once (kept in this browser), so
 * the summary never waits on the network; the shared copy is written in the background, with retries,
 * and `shared` resolves false when it could not be (the caller then says the link only works here).
 */
export function saveConfiguration(config: SavedConfiguration): SavedCode {
  const code = newConfigCode();
  const local = readLocal<Record<string, SavedConfiguration>>(LOCAL_CODES, {});
  local[code] = config;
  writeLocal(LOCAL_CODES, local);
  const shared = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { error } = await withTimeout(supabase.from('saved_configurations').insert({ code, payload: config }), 8000);
        if (!error) return true;
        console.warn(`Saving configuration ${code} failed (attempt ${attempt + 1}):`, error.message);
        if (error.code === '23505') return false; // the code exists already (1 in 10^15): keep the local copy only
      } catch (err) {
        console.warn(`Saving configuration ${code} failed (attempt ${attempt + 1}):`, err);
      }
    }
    return false;
  })();
  return { code, shared };
}

export async function loadConfiguration(code: string): Promise<SavedConfiguration | null> {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 10) return null;
  const local = readLocal<Record<string, SavedConfiguration>>(LOCAL_CODES, {})[clean];
  if (local) return local;
  const { data, error } = await supabase.rpc('get_configuration', { p_code: clean });
  if (error || !data) return null;
  return data as SavedConfiguration;
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

/** Sends an enquiry to Supabase; keeps a copy in this browser if that fails. */
export async function submitEnquiry(enquiry: Enquiry): Promise<EnquiryResult> {
  const { error } = await supabase.from('leads').insert({
    name: enquiry.name.trim() || null,
    email: enquiry.email,
    phone: enquiry.phone || null,
    message: enquiry.message || null,
    consultation: enquiry.consultation,
    config_code: enquiry.configCode || null,
    configuration: enquiry.configuration ?? null,
    region: enquiry.region ?? null,
    source: enquiry.source ?? 'enquiry'
  });
  if (!error) return { status: 'sent' };
  // A deliberate refusal (the lead rate limit raises P0001 with a visitor-facing message, a check
  // constraint 23514) is shown, not hidden behind a "sent"
  if (error.code === 'P0001' || error.code === '23514' || /too many/i.test(error.message)) {
    return { status: 'rejected', message: error.code === 'P0001' ? error.message : 'This enquiry could not be accepted. Please check your details and try again.' };
  }
  console.warn('Enquiry kept in this browser:', error.message);
  writeLocal(LOCAL_LEADS, [{ ...enquiry, at: new Date().toISOString() }, ...readLocal<unknown[]>(LOCAL_LEADS, [])]);
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
