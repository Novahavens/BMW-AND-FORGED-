// Receives a rim cut-out plus its catalogue data from the wheel pipeline, normalizes it (rim circle
// only, 2048px square, neutral grey), checks it will extrude into 3D spokes, uploads it to the
// rim-images bucket and creates/updates the wheel row.
// Auth: the caller sends a key in `x-ingest-secret`; it must match the INGEST_SECRET function secret
// or a SHA-256 hash stored in public.ingest_keys (a table only the service role can read).
import UPNG from 'npm:upng-js@2.1.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRim } from './validate.ts';
import { normalizeRim } from './normalize.ts';
import { encodeGreyAlphaPng } from './png.ts';

// The six placeholder designs shipped with the app; removed once a real wheel is live.
const GENERIC_WHEEL_IDS = [
  'fw_01_monoblock_gt3',
  'fw_02_aerodisc_gt',
  'fw_03_csl_yspoke',
  'fw_04_twin_turbine',
  'fw_05_dtm_multispoke',
  'fw_06_clubsport_deep',
];
// Must match the South Africa rate in config/brand.ts: prices are stored in USD and converted on display.
const ZAR_PER_USD = 18.2;
const MAX_PNG_BYTES = 10 * 1024 * 1024;

interface WheelInput {
  name?: string;
  code?: string;
  subtitle?: string;
  description?: string;
  highlights?: string[];
  style?: string;
  spoke_count?: number;
  sizes?: (string | number)[];
  prices_usd?: number[];
  prices_zar?: number[];
  finishes?: string[];
  weight_front_kg?: number;
  weight_rear_kg?: number;
}

interface IngestRequest {
  file_name?: string;
  png_base64?: string;
  wheel?: WheelInput;
  ai_ready?: boolean;
  ai_issues?: string;
  remove_generic?: boolean;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s-]+/g, '_').slice(0, 48);

const normSize = (s: string | number) => `${String(s).replace(/["”″\s]|inch(es)?/gi, '')}"`;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const given = req.headers.get('x-ingest-secret') ?? '';
  const secret = Deno.env.get('INGEST_SECRET') ?? '';
  let authorized = !!secret && safeEqual(given, secret);
  if (!authorized && given.length >= 32) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(given)));
    const hash = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
    const { data } = await supabase.from('ingest_keys').select('key_hash').eq('key_hash', hash).maybeSingle();
    authorized = !!data;
  }
  if (!authorized) return json(401, { error: 'unauthorized' });

  let body: IngestRequest;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'body must be JSON' });
  }

  const w = body.wheel ?? {};
  const name = (w.name ?? '').trim();
  if (!name) return json(400, { error: 'wheel.name is required' });
  if (!body.png_base64) return json(400, { error: 'png_base64 is required' });

  const bytes = Uint8Array.from(atob(body.png_base64.replace(/^data:[^,]+,/, '')), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_PNG_BYTES) return json(400, { error: 'PNG is larger than 10 MB' });
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return json(400, { error: 'file is not a PNG' });

  let rim;
  let finalPng: Uint8Array;
  try {
    const img = UPNG.decode(bytes.buffer);
    const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
    const norm = normalizeRim(rgba, img.width, img.height);
    if (!norm) return json(400, { error: 'no rim found in the image (it is empty or fully transparent)' });
    rim = checkRim(norm.rgba, norm.side, norm.side);
    finalPng = await encodeGreyAlphaPng(norm.rgba, norm.side, norm.side);
  } catch (e) {
    return json(400, { error: `could not read PNG: ${(e as Error).message}` });
  }

  const dataIssues: string[] = [];
  const sizes = (w.sizes ?? []).map(normSize);
  if (!sizes.length) dataIssues.push('no sizes given');
  const rawPrices = w.prices_usd?.length ? w.prices_usd : (w.prices_zar ?? []).map((z) => Math.round((z / ZAR_PER_USD) * 100) / 100);
  if (rawPrices.length !== sizes.length) dataIssues.push(`${sizes.length} sizes but ${rawPrices.length} prices`);
  if (rawPrices.some((p) => !(Number(p) > 0))) dataIssues.push('every price must be a positive number');
  const priceBySize: Record<string, number> = {};
  sizes.forEach((s, i) => (priceBySize[s] = Number(rawPrices[i])));

  const { data: finishRows, error: finishErr } = await supabase.from('wheel_finishes').select('id, name');
  if (finishErr) return json(500, { error: finishErr.message });
  const knownFinishes = new Set((finishRows ?? []).map((f) => f.id as string));
  const finishByKey = new Map<string, string>();
  (finishRows ?? []).forEach((f) => {
    finishByKey.set(slug(f.id as string), f.id as string);
    finishByKey.set(slug(f.name as string), f.id as string);
  });
  const requested = (w.finishes ?? []).map((f) => String(f).trim()).filter(Boolean);
  const finishes = requested.map((f) => finishByKey.get(slug(f)) ?? slug(f));
  const unknown = requested.filter((f) => !finishByKey.has(slug(f)));
  if (unknown.length) {
    const valid = (finishRows ?? []).map((f) => `${f.id} (${f.name})`).join(', ');
    dataIssues.push(`unknown finishes: ${unknown.join(', ')}; valid: ${valid}`);
  }
  if (!finishes.length) dataIssues.push('no finishes given');

  const aiIssues = body.ai_ready ? [] : [`AI check: ${body.ai_issues || 'not passed'}`];
  const reasons = [...rim.reasons, ...dataIssues, ...aiIssues];
  const live = reasons.length === 0;

  const id = `forged_${slug(w.code || name)}`;
  const path = `pipeline/${id}-${Date.now()}.png`;
  const { error: upErr } = await supabase.storage.from('rim-images').upload(path, finalPng, { contentType: 'image/png', upsert: false });
  if (upErr) return json(500, { error: `upload failed: ${upErr.message}` });
  const imageUrl = supabase.storage.from('rim-images').getPublicUrl(path).data.publicUrl;

  const { data: existing } = await supabase
    .from('wheels')
    .select('id, sort_order, style, spoke_count, weight_front_kg, weight_rear_kg')
    .eq('id', id)
    .maybeSingle();
  let sortOrder = existing?.sort_order;
  if (sortOrder === undefined) {
    const { data: last } = await supabase.from('wheels').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    sortOrder = (last?.sort_order ?? -1) + 1;
  }

  // Fields the sheet leaves blank keep what an admin set in /admin on an earlier run.
  const front = Number(w.weight_front_kg) || Number(existing?.weight_front_kg) || 0;
  const rear = Number(w.weight_rear_kg) || Number(existing?.weight_rear_kg) || 0;
  const validPrices = Object.values(priceBySize).filter((p) => p > 0);
  const row = {
    id,
    code: (w.code || name).toUpperCase(),
    name,
    subtitle: w.subtitle ?? '',
    style: w.style?.trim() || existing?.style || '',
    spoke_type: 'multi',
    spoke_count: Math.max(1, Math.round(Number(w.spoke_count) || Number(existing?.spoke_count) || 10)),
    weight_front_kg: front,
    weight_rear_kg: rear,
    weight_savings_kg: 0,
    standard_sizes: sizes,
    price_by_size: priceBySize,
    price_per_set: validPrices.length ? Math.min(...validPrices) : 0,
    description: w.description ?? '',
    highlights: (w.highlights ?? []).filter(Boolean).slice(0, 5),
    available_variants: finishes.filter((f) => knownFinishes.has(f)),
    default_variant: finishes.find((f) => knownFinishes.has(f)) ?? 'liquid_metal',
    image_url: imageUrl,
    image_extrude: true,
    sort_order: sortOrder,
    active: live,
  };
  const { error: rowErr } = await supabase.from('wheels').upsert(row, { onConflict: 'id' });
  if (rowErr) return json(500, { error: `saving wheel failed: ${rowErr.message}`, image_url: imageUrl });

  let removedGeneric: string[] = [];
  if (body.remove_generic && live) {
    const { data: gone, error: delErr } = await supabase.from('wheels').delete().in('id', GENERIC_WHEEL_IDS).select('id');
    if (!delErr) removedGeneric = (gone ?? []).map((g) => g.id as string);
  }

  return json(200, {
    ok: true,
    wheel_id: id,
    live,
    status: live ? 'LIVE' : 'HIDDEN - needs attention',
    reasons,
    image_url: imageUrl,
    rim_check: rim.metrics,
    removed_generic: removedGeneric,
  });
});
