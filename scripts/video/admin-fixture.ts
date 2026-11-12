/**
 * Fixture rows for the admin tutorial capture: the bundled catalogue (data/configuratorData.ts) in the same
 * snake_case shape Postgres returns, plus clearly fictional sample enquiries (example.com addresses).
 *
 *   bun run scripts/video/admin-fixture.ts > <out>/fixtures.json
 *
 * Used only by scripts/video/capture-admin.cjs, which answers the admin's Supabase calls with these rows, so the
 * real admin screens can be filmed with no admin account and no real customer data.
 */
import { BMW_MODELS, BMW_PAINTS, WHEEL_DESIGNS, WHEEL_FINISHES } from '../../data/configuratorData';

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const row = (o: Record<string, unknown>, i: number) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[toSnake(k)] = v ?? null;
  out.sort_order = i + 1;
  if (out.active === undefined || out.active === null) out.active = true;
  return out;
};
/** Live items first, hidden (retired) ones after, then numbered 1..n as sort_order. */
const ordered = (list: Record<string, unknown>[]) => {
  const rows = list.map(row);
  const live = rows.filter((r) => r.active !== false), hidden = rows.filter((r) => r.active === false);
  return [...live, ...hidden].map((r, i) => ({ ...r, sort_order: i + 1 }));
};
const fin = Object.values(WHEEL_FINISHES as unknown as Record<string, Record<string, unknown>>);
const day = (n: number) => new Date(Date.UTC(2026, 10, 11, 9, 0) - n * 86400000).toISOString();
const cfg = (car: string, paint: string, wheel: string, size: string, finish: string) => ({ car, paint, wheel, size, finish });
const leads = [
  { id: 'l1', name: 'Sample Customer', email: 'sample.customer@example.com', phone: '+27 82 000 0001', message: 'Is the FF-3 in stock for my M2? Could I fit it this month?', consultation: true, config_code: 'SAMPLE0001', configuration: cfg('BMW M2 CS', 'Black Sapphire', 'FF-3', '21"', 'Pure Bronze'), region: 'ZA', source: 'enquiry', created_at: day(0) },
  { id: 'l2', name: 'Demo Buyer', email: 'demo.buyer@example.com', phone: null, message: null, consultation: false, config_code: 'SAMPLE0002', configuration: cfg('BMW M4 CS', 'Sao Paulo Yellow', 'FSA002', '20"', 'Gold'), region: 'ZA', source: 'pdf', created_at: day(1) },
  { id: 'l3', name: 'Example Person', email: 'example.person@example.com', phone: '+27 71 000 0003', message: 'Can you send fitment details for a G80 M3?', consultation: true, config_code: 'SAMPLE0003', configuration: cfg('BMW M5', 'Fire Red', 'FF-1', '21"', 'Liquid Metal'), region: 'ZA', source: 'enquiry', created_at: day(2) },
  { id: 'l4', name: 'Test Visitor', email: 'test.visitor@example.com', phone: null, message: null, consultation: false, config_code: 'SAMPLE0004', configuration: cfg('BMW M5 Touring', 'Frozen Pure Grey', 'FSA004', '20"', 'Silver'), region: 'ZA', source: 'pdf', created_at: day(4) }
];
console.log(JSON.stringify({
  cars: ordered(BMW_MODELS as unknown as Record<string, unknown>[]),
  paints: (BMW_PAINTS as unknown as Record<string, unknown>[]).map(row),
  wheels: ordered(WHEEL_DESIGNS as unknown as Record<string, unknown>[]),
  wheel_finishes: fin.map(row),
  leads
}));
