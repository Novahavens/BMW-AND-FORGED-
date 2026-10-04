// Receives one rim photo already in a finish (the n8n "FORGED finish sprites" workflow), uploads it to
// the rim-images bucket under sprites/ and records it in wheels.rim_sprites[finish_id], which the 2D
// wheel stage draws instead of tinting the grey rim photo. `clear: true` removes the entry instead.
// Auth: same as ingest-wheel: `x-ingest-secret` matches INGEST_SECRET or a SHA-256 hash in public.ingest_keys.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MAX_PNG_BYTES = 12 * 1024 * 1024;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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

  let body: { wheel_id?: string; finish_id?: string; png_base64?: string; clear?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'body must be JSON' });
  }
  const wheelId = String(body.wheel_id ?? '').trim();
  const finishId = String(body.finish_id ?? '').trim();
  if (!/^[a-z0-9_]{1,64}$/.test(wheelId) || !/^[a-z0-9_]{1,64}$/.test(finishId)) return json(400, { error: 'wheel_id and finish_id must be ids' });

  const { data: wheel } = await supabase.from('wheels').select('id, rim_sprites').eq('id', wheelId).maybeSingle();
  if (!wheel) return json(404, { error: `no wheel ${wheelId}` });
  const { data: finish } = await supabase.from('wheel_finishes').select('id').eq('id', finishId).maybeSingle();
  if (!finish) return json(404, { error: `no finish ${finishId}` });
  const sprites: Record<string, string> = { ...((wheel.rim_sprites as Record<string, string>) ?? {}) };

  if (body.clear) {
    delete sprites[finishId];
  } else {
    const b64 = String(body.png_base64 ?? '').replace(/^data:image\/png;base64,/, '');
    let png: Uint8Array;
    try {
      png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      return json(400, { error: 'png_base64 is not base64' });
    }
    if (png.length < 1000 || png.length > MAX_PNG_BYTES) return json(400, { error: `PNG size ${png.length} bytes out of range` });
    const sig = [0x89, 0x50, 0x4e, 0x47];
    if (!sig.every((v, i) => png[i] === v)) return json(400, { error: 'not a PNG' });
    // timestamped and never overwritten, so it can be cached for a year
    const path = `sprites/${wheelId}/${finishId}-${Date.now()}.png`;
    const { error: upErr } = await supabase.storage
      .from('rim-images')
      .upload(path, png, { contentType: 'image/png', upsert: false, cacheControl: '31536000' });
    if (upErr) return json(500, { error: `upload failed: ${upErr.message}` });
    sprites[finishId] = supabase.storage.from('rim-images').getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from('wheels').update({ rim_sprites: sprites }).eq('id', wheelId);
  if (error) return json(500, { error: `saving failed: ${error.message}` });
  return json(200, { ok: true, wheel_id: wheelId, finish_id: finishId, url: sprites[finishId] ?? null, rim_sprites: sprites });
});
