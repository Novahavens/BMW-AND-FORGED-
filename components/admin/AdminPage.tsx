/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Loader2, LogOut, Plus, Save, Trash2, Upload, ShieldCheck } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import {
  deleteRow,
  isCurrentUserAdmin,
  listRows,
  upsertRow,
  uploadAsset
} from '../../services/catalogService';
import { ENTITIES, EntitySpec, FieldSpec } from './entityConfig';
import { EnquiriesPanel } from './EnquiriesPanel';
import { ASSET_BUCKETS, authFlags } from '../../services/supabaseClient';
import { CAD_EXTENSIONS, convertCadFile, isCadFile } from '../../services/cadToGlb';

type Row = Record<string, unknown>;

interface AdminPageProps {
  onBack: () => void;
  /** Called after any successful write so the configurator reloads the catalogue. */
  onCatalogChanged: () => void;
}

const inputCls =
  'w-full bg-[#0d0d0d] border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#CF9F52]';

export const AdminPage: React.FC<AdminPageProps> = ({ onBack, onCatalogChanged }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  // Arrived from a "set your password" email: ask for the new password before anything else.
  const [recovering, setRecovering] = useState(authFlags.passwordRecovery);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setIsAdmin(null);
    if (session) isCurrentUserAdmin(session.user.email).then(setIsAdmin);
  }, [session]);

  return (
    <div className="absolute inset-0 overflow-y-auto bg-black text-neutral-200 select-text">
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/90 backdrop-blur">
        <button onClick={onBack} className="flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to studio
        </button>
        <div className="flex items-center gap-2 text-sm font-bold tracking-widest uppercase">
          <ShieldCheck className="w-4 h-4 text-[#CF9F52]" /> FORGEDSA Admin
        </div>
        {session ? (
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-400 hover:text-white"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        ) : <span className="w-24" />}
      </header>

      {!authChecked ? (
        <Centered><Loader2 className="w-6 h-6 animate-spin text-[#CF9F52]" /></Centered>
      ) : session && recovering ? (
        <SetPasswordForm
          email={session.user.email ?? ''}
          onDone={() => {
            authFlags.passwordRecovery = false;
            setRecovering(false);
          }}
        />
      ) : !session ? (
        <LoginForm />
      ) : isAdmin === null ? (
        <Centered><Loader2 className="w-6 h-6 animate-spin text-[#CF9F52]" /></Centered>
      ) : !isAdmin ? (
        <Centered>
          <p className="text-sm text-neutral-400 text-center max-w-sm">
            {session.user.email} is signed in but is not on the admin allowlist.
          </p>
        </Centered>
      ) : (
        <CatalogEditor onCatalogChanged={onCatalogChanged} />
      )}
    </div>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center justify-center min-h-[70vh] px-4">{children}</div>
);

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'signin' | 'reset' | 'sent'>('signin');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (mode === 'reset') {
      // Supabase emails a one-time link back to /admin, where the new password is chosen.
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/admin`
      });
      if (err) setError(err.message);
      else setMode('sent');
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    }
    setBusy(false);
  };

  if (mode === 'sent') {
    return (
      <Centered>
        <div className="w-full max-w-sm space-y-4 p-6 rounded-xl border border-white/10 bg-[#080808]">
          <h1 className="text-lg font-bold text-white">Check your inbox</h1>
          <p className="text-sm text-neutral-400">
            If {email} is an admin account, a link to set your password is on its way. Open it on this device; it brings you
            back here to choose the password. The link works once and expires after an hour.
          </p>
          <button onClick={() => setMode('signin')} className="text-xs uppercase tracking-widest text-[#E8C37D] hover:text-white">
            Back to sign in
          </button>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 p-6 rounded-xl border border-white/10 bg-[#080808]">
        <div>
          <h1 className="text-lg font-bold text-white">{mode === 'reset' ? 'Set or reset your password' : 'Admin sign in'}</h1>
          <p className="text-xs text-neutral-500 mt-1">
            {mode === 'reset'
              ? 'Enter your admin email and we will email you a link to choose a password.'
              : 'Manage cars, wheels, prices, finishes, paints, 3D assets and enquiries.'}
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Email</span>
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </label>
        {mode === 'signin' && (
          <label className="block space-y-1">
            <span className="text-xs text-neutral-400">Password</span>
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </label>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-[#CF9F52] hover:bg-[#E8C37D] disabled:opacity-60 text-black font-bold text-sm rounded-md py-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {mode === 'reset' ? 'Email me a link' : 'Sign in'}
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'reset' ? 'signin' : 'reset'); setError(null); }}
          className="w-full text-center text-xs text-neutral-400 hover:text-white"
        >
          {mode === 'reset' ? 'Back to sign in' : 'First time here, or forgot your password?'}
        </button>
      </form>
    </Centered>
  );
};

/** Shown after following a "set your password" email link (the link signs the admin in once). */
const SetPasswordForm: React.FC<{ email: string; onDone: () => void }> = ({ email, onDone }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return setError('Use at least 10 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else onDone();
  };

  return (
    <Centered>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 p-6 rounded-xl border border-white/10 bg-[#080808]">
        <div>
          <h1 className="text-lg font-bold text-white">Choose your password</h1>
          <p className="text-xs text-neutral-500 mt-1">For {email}. You will use it to sign in to the admin from now on.</p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">New password</span>
          <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Repeat it</span>
          <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-[#CF9F52] hover:bg-[#E8C37D] disabled:opacity-60 text-black font-bold text-sm rounded-md py-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save password
        </button>
      </form>
    </Centered>
  );
};

const CatalogEditor: React.FC<{ onCatalogChanged: () => void }> = ({ onCatalogChanged }) => {
  const [entity, setEntity] = useState<EntitySpec>(ENTITIES[0]);
  const [showLeads, setShowLeads] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [finishIds, setFinishIds] = useState<string[]>([]);
  const [paintOptions, setPaintOptions] = useState<PickOption[]>([]);
  const [draft, setDraft] = useState<Row | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async (spec: EntitySpec) => {
    setLoading(true);
    try {
      const [data, finishes, paints] = await Promise.all([
        listRows(spec.table),
        listRows('wheel_finishes'),
        spec.table === 'cars' ? listRows('paints') : Promise.resolve([])
      ]);
      setRows(data);
      setFinishIds(finishes.map((f) => String(f.id)));
      setPaintOptions(
        paints.map((p) => ({
          id: String(p.id),
          label: `${p.name} (${p.code})${p.active === false ? ' · hidden' : ''}`,
          swatch: typeof p.hex === 'string' ? p.hex : undefined
        }))
      );
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setDraft(null);
    setMessage(null);
    load(entity);
  }, [entity, load]);

  const handleSave = async () => {
    if (!draft) return;
    if (!String(draft.id || '').trim() || !String(draft.name || '').trim()) {
      setMessage({ kind: 'error', text: 'ID and name are required.' });
      return;
    }
    if (isNew && rows.some((r) => r.id === draft.id)) {
      setMessage({ kind: 'error', text: `ID "${draft.id}" already exists.` });
      return;
    }
    let row = draft;
    if (entity.table === 'wheels') {
      // Sizes and the "from" price are derived from the per-size price list
      const prices = (draft.price_by_size as Record<string, number>) || {};
      const sizes = Object.keys(prices).sort((a, b) => parseFloat(a) - parseFloat(b));
      if (sizes.length === 0) {
        setMessage({ kind: 'error', text: 'Add at least one size with a price.' });
        return;
      }
      row = { ...draft, standard_sizes: sizes, price_per_set: Math.min(...sizes.map((s) => prices[s])) };
    }
    setSaving(true);
    try {
      await upsertRow(entity.table, row);
      setMessage({ kind: 'ok', text: `Saved ${draft.name}.` });
      setIsNew(false);
      await load(entity);
      onCatalogChanged();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!draft || isNew) return;
    if (!window.confirm(`Delete "${draft.name}"? This cannot be undone. Untick "Visible" to hide it instead.`)) return;
    try {
      await deleteRow(entity.table, String(draft.id));
      setDraft(null);
      setMessage({ kind: 'ok', text: 'Deleted.' });
      await load(entity);
      onCatalogChanged();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <nav className="flex flex-wrap gap-2 mb-6">
        {ENTITIES.map((spec) => (
          <button
            key={spec.table}
            onClick={() => { setEntity(spec); setShowLeads(false); }}
            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest border ${
              !showLeads && spec.table === entity.table
                ? 'bg-[#CF9F52] text-black border-[#CF9F52]'
                : 'border-white/10 text-neutral-400 hover:text-white hover:border-white/30'
            }`}
          >
            {spec.label}
          </button>
        ))}
        <button
          onClick={() => setShowLeads(true)}
          className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest border ${
            showLeads ? 'bg-[#CF9F52] text-black border-[#CF9F52]' : 'border-white/10 text-neutral-400 hover:text-white hover:border-white/30'
          }`}
        >
          Enquiries
        </button>
      </nav>

      {showLeads ? <EnquiriesPanel /> : <>

      {message && (
        <p className={`mb-4 text-xs ${message.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>
      )}

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          <button
            onClick={() => { setDraft({ ...entity.defaults }); setIsNew(true); setMessage(null); }}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-white/20 hover:border-[#CF9F52] rounded-md py-2 text-xs uppercase tracking-widest"
          >
            <Plus className="w-4 h-4" /> New {entity.label.replace(/s$/, '').toLowerCase()}
          </button>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-[#CF9F52] mx-auto mt-6" />
          ) : (
            rows.map((row) => (
              <button
                key={String(row.id)}
                onClick={() => { setDraft({ ...row }); setIsNew(false); setMessage(null); }}
                className={`w-full text-left px-3 py-2 rounded-md border text-sm ${
                  draft && !isNew && draft.id === row.id ? 'border-[#CF9F52] bg-white/5' : 'border-white/10 hover:border-white/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  {typeof row.hex === 'string' && <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: row.hex }} />}
                  <span className="truncate text-white">{String(row.name)}</span>
                </div>
                <div className="text-[11px] text-neutral-500 truncate">
                  {String(row.id)}{row.active === false ? ' · hidden' : ''}
                  {row.model_url || row.image_url ? ' · asset' : ''}
                </div>
              </button>
            ))
          )}
        </aside>

        <section>
          {!draft ? (
            <p className="text-sm text-neutral-500 mt-2">Select an item to edit, or create a new one.</p>
          ) : (
            <div className="space-y-4 p-5 rounded-xl border border-white/10 bg-[#080808]">
              {entity.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={draft[field.key]}
                  folder={String(draft.id || 'unsorted')}
                  finishIds={finishIds}
                  paintOptions={paintOptions}
                  readOnly={field.key === 'id' && !isNew}
                  onError={(text) => setMessage({ kind: 'error', text })}
                  onChange={(v) => setDraft((d) => (d ? { ...d, [field.key]: v } : d))}
                />
              ))}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleDelete}
                  disabled={isNew}
                  className="flex items-center gap-2 text-xs uppercase tracking-widest text-red-400 hover:text-red-300 disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-[#CF9F52] hover:bg-[#E8C37D] disabled:opacity-60 text-black font-bold text-sm rounded-md px-5 py-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      </>}
    </div>
  );
};

interface FieldInputProps {
  field: FieldSpec;
  value: unknown;
  folder: string;
  finishIds: string[];
  paintOptions: PickOption[];
  readOnly: boolean;
  onChange: (v: unknown) => void;
  onError: (text: string) => void;
}

interface PickOption {
  id: string;
  label: string;
  swatch?: string;
}

/** Tick-box multi-select over ids (wheel finishes, car paints); keeps the order things were ticked in. */
const MultiPick: React.FC<{ options: PickOption[]; value: unknown; onChange: (v: string[]) => void }> = ({ options, value, onChange }) => {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-1.5 text-xs border border-white/10 rounded px-2 py-1">
          <input
            type="checkbox"
            className="accent-[#CF9F52]"
            checked={selected.includes(o.id)}
            onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((s) => s !== o.id))}
          />
          {o.swatch && <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: o.swatch }} />}
          {o.label}
        </label>
      ))}
    </div>
  );
};

const FieldInput: React.FC<FieldInputProps> = ({ field, value, folder, finishIds, paintOptions, readOnly, onChange, onError }) => {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  let control: React.ReactNode;

  switch (field.type) {
    case 'textarea':
      control = <textarea rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
      break;
    case 'number':
      control = (
        <input
          type="number"
          step={field.step ?? 'any'}
          value={value === null || value === undefined ? '' : Number(value)}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className={inputCls}
        />
      );
      break;
    case 'color':
      control = (
        <div className="flex gap-2">
          <input type="color" value={String(value || '#000000')} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 bg-transparent border border-white/10 rounded" />
          <input type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls} />
        </div>
      );
      break;
    case 'bool':
      control = (
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[#CF9F52]" />
      );
      break;
    case 'select':
      control = (
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case 'list':
      control = (
        <textarea
          rows={3}
          value={Array.isArray(value) ? value.join('\n') : ''}
          onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
          className={inputCls}
        />
      );
      break;
    case 'finishes':
      control = <MultiPick options={finishIds.map((id) => ({ id, label: id }))} value={value} onChange={onChange} />;
      break;
    case 'paints':
      control = <MultiPick options={paintOptions} value={value} onChange={onChange} />;
      break;
    case 'fitment': {
      const fit = (value as Record<string, string>) || {};
      control = (
        <div className="grid grid-cols-2 gap-2">
          {(['front', 'rear', 'pcd', 'cb'] as const).map((k) => (
            <input
              key={k}
              placeholder={k.toUpperCase()}
              value={fit[k] ?? ''}
              onChange={(e) => onChange({ ...fit, [k]: e.target.value })}
              className={inputCls}
            />
          ))}
        </div>
      );
      break;
    }
    case 'sizePrices': {
      const prices = (value as Record<string, number>) || {};
      const sizes = Object.keys(prices).sort((a, b) => parseFloat(a) - parseFloat(b));
      const setPrices = (next: Record<string, number>) => onChange(next);
      control = (
        <div className="space-y-2">
          {sizes.map((size) => (
            <div key={size} className="flex items-center gap-2">
              <span className="w-12 text-sm text-white font-bold">{size}</span>
              <input
                type="number"
                step={50}
                value={prices[size]}
                onChange={(e) => setPrices({ ...prices, [size]: Number(e.target.value) || 0 })}
                className={inputCls}
              />
              <button
                onClick={() => { const { [size]: _removed, ...rest } = prices; setPrices(rest); }}
                className="text-neutral-500 hover:text-red-400 px-2"
                title={`Remove ${size}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {['18"', '19"', '20"', '21"', '22"', '23"'].filter((s) => !(s in prices)).map((s) => (
              <button
                key={s}
                onClick={() => setPrices({ ...prices, [s]: 0 })}
                className="text-xs border border-dashed border-white/20 hover:border-[#CF9F52] rounded px-2 py-1"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      );
      break;
    }
    case 'asset': {
      const url = typeof value === 'string' ? value : '';
      control = (
        <div className="space-y-2">
          {url && field.bucket === 'rim-images' && (
            <img src={url} alt="" className="w-28 h-28 object-contain rounded border border-white/10 bg-neutral-900" />
          )}
          {url && <a href={url} target="_blank" rel="noreferrer" className="block text-[11px] text-[#FF7722] break-all">{url}</a>}
          <div className="flex gap-2">
            <label className="flex items-center gap-2 cursor-pointer border border-white/10 hover:border-[#CF9F52] rounded-md px-3 py-2 text-xs uppercase tracking-widest">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {url ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept={field.bucket === ASSET_BUCKETS.rimModels ? `${field.accept},${CAD_EXTENSIONS.join(',')}` : field.accept}
                className="hidden"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setUploading(true);
                  setStatus(null);
                  try {
                    let upload = file;
                    // Manufacturer CAD (STEP/IGES/STL/OBJ) is converted to a web-ready rim GLB first, in the browser.
                    if (field.bucket === ASSET_BUCKETS.rimModels && isCadFile(file)) {
                      upload = await convertCadFile(file, (msg) => setStatus(msg));
                      setStatus(`Converted ${file.name} → ${upload.name} (${(upload.size / 1048576).toFixed(1)} MB). Uploading…`);
                    }
                    onChange(await uploadAsset(field.bucket, folder, upload));
                    setStatus(upload === file ? null : `Converted and uploaded ${upload.name}. Click Save to apply.`);
                  } catch (err) {
                    setStatus(null);
                    onError(`Upload failed: ${(err as Error).message}`);
                  }
                  setUploading(false);
                }}
              />
            </label>
            {url && (
              <button onClick={() => onChange(null)} className="text-xs uppercase tracking-widest text-neutral-400 hover:text-white px-2">
                Remove
              </button>
            )}
          </div>
          {status && <p className="text-[11px] text-[#E8C37D] break-words">{status}</p>}
          {url && !status && <p className="text-[11px] text-neutral-500">Click Save to apply the new file.</p>}
        </div>
      );
      break;
    }
    default:
      control = (
        <input
          type="text"
          value={String(value ?? '')}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} ${readOnly ? 'opacity-60' : ''}`}
        />
      );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-neutral-400">{field.label}</div>
      {control}
      {field.hint && <p className="text-[11px] text-neutral-600">{field.hint}</p>}
    </div>
  );
};
