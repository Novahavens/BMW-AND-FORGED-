/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';
import {
  BMW_MODELS,
  BMW_PAINTS,
  WHEEL_DESIGNS,
  WHEEL_FINISHES,
  CALIPER_COLORS
} from '../data/configuratorData';
import { CarModel, PaintColor, WheelDesign, WheelFinish, CaliperColor } from '../types';

export interface Catalog {
  cars: CarModel[];
  paints: PaintColor[];
  wheels: WheelDesign[];
  finishes: Record<string, WheelFinish>;
  calipers: CaliperColor[];
}

export type CatalogTable = 'cars' | 'paints' | 'wheels' | 'wheel_finishes' | 'calipers';

/** Bundled catalogue, used when Supabase is unreachable so the demo never renders empty. */
export const STATIC_CATALOG: Catalog = {
  cars: BMW_MODELS,
  paints: BMW_PAINTS,
  // Supabase hides inactive wheels from customers (RLS); the bundled list carries the same flag.
  wheels: WHEEL_DESIGNS.filter((w) => w.active !== false),
  finishes: WHEEL_FINISHES,
  calipers: CALIPER_COLORS
};

// Rows are snake_case in Postgres and camelCase in the app; only top-level keys are converted
// (recommended_wheel_fitment's inner keys are already single words).
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

export const rowToApp = <T,>(row: Record<string, unknown>): T =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) as T;

export const appToRow = (obj: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [toSnake(k), v]));

/**
 * The car's factory palette in BMW's order. Falls back to every active paint when the car lists
 * none (or none of its ids exist in this catalogue, e.g. a partly loaded one). Inactive paints are
 * never offered.
 */
export function paintsForCar(paints: PaintColor[], car?: Pick<CarModel, 'paintIds'> | null): PaintColor[] {
  const active = paints.filter((p) => p.active !== false);
  const ids = car?.paintIds ?? [];
  if (ids.length === 0) return active;
  const byId = new Map(active.map((p) => [p.id, p]));
  const palette = ids.map((id) => byId.get(id)).filter((p): p is PaintColor => !!p);
  return palette.length ? palette : active;
}

/** Keeps the wanted paint when the car offers it, otherwise the car's first factory paint. */
export function pickPaintForCar(paints: PaintColor[], car: Pick<CarModel, 'paintIds'> | null | undefined, wantedId?: string): PaintColor | undefined {
  const palette = paintsForCar(paints, car);
  return palette.find((p) => p.id === wantedId) ?? palette[0] ?? paints[0];
}

async function selectTable<T>(table: CatalogTable, onlyActive = false): Promise<T[] | null> {
  // RLS hides inactive rows from customers but not from a signed-in admin, so the public catalogue
  // filters them itself (otherwise an admin's browser shows retired cars and hidden wheels).
  let query = supabase.from(table).select('*');
  if (onlyActive) query = query.eq('active', true);
  const { data, error } = await query.order('sort_order');
  if (error || !data || data.length === 0) {
    if (error) console.warn(`Catalog: falling back to bundled ${table}`, error.message);
    return null;
  }
  return data.map((r) => rowToApp<T>(r));
}

export async function fetchCatalog(): Promise<{ catalog: Catalog; source: 'supabase' | 'static' }> {
  // A preview built with VITE_CATALOG_SOURCE=static shows the bundled catalogue (the migrations may not
  // be applied to the live database yet). Share codes, leads and the admin still talk to Supabase.
  if (import.meta.env.VITE_CATALOG_SOURCE === 'static') return { catalog: STATIC_CATALOG, source: 'static' };
  try {
    const [cars, paints, wheels, finishes, calipers] = await Promise.all([
      selectTable<CarModel>('cars', true),
      selectTable<PaintColor>('paints'),
      selectTable<WheelDesign>('wheels', true),
      selectTable<WheelFinish>('wheel_finishes', true),
      selectTable<CaliperColor>('calipers')
    ]);
    const catalog: Catalog = {
      // paint_ids -> paintIds; rows from before the factory-paints migration have none
      cars: cars ? cars.map((c) => ({ ...c, paintIds: Array.isArray(c.paintIds) ? c.paintIds : [] })) : STATIC_CATALOG.cars,
      paints: paints ?? STATIC_CATALOG.paints,
      wheels: wheels ?? STATIC_CATALOG.wheels,
      finishes: finishes
        ? Object.fromEntries(finishes.map((f) => [f.id, f]))
        : STATIC_CATALOG.finishes,
      calipers: calipers ?? STATIC_CATALOG.calipers
    };
    const allRemote = [cars, paints, wheels, finishes, calipers].every(Boolean);
    return { catalog, source: allRemote ? 'supabase' : 'static' };
  } catch (e) {
    console.warn('Catalog: Supabase unavailable, using bundled catalogue', e);
    return { catalog: STATIC_CATALOG, source: 'static' };
  }
}

// ----------------------------------------------------
// ADMIN OPERATIONS (require an allowlisted, signed-in admin; enforced by RLS)
// ----------------------------------------------------

export async function listRows(table: CatalogTable): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from(table).select('*').order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function upsertRow(table: CatalogTable, row: Record<string, unknown>) {
  const { updated_at: _ignored, ...payload } = row;
  const { error } = await supabase.from(table).upsert(payload);
  if (error) throw error;
}

export async function deleteRow(table: CatalogTable, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

/** Uploads to a public bucket and returns the file's public URL. */
export async function uploadAsset(bucket: string, folder: string, file: File): Promise<string> {
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const path = `${folder}/${Date.now()}-${safeName}`;
  const contentType = file.name.toLowerCase().endsWith('.glb')
    ? 'model/gltf-binary'
    : file.type || 'application/octet-stream';
  // Names carry a timestamp and are never overwritten, so the file can be cached for a year.
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: false, cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** True when the signed-in user's email is on the admin allowlist (RLS hides it from everyone else). */
export async function isCurrentUserAdmin(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const { data, error } = await supabase
    .from('admin_users')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  return !error && !!data;
}
