/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Check, FileText, FolderOpen, Loader2, Lock, LogOut, MonitorSmartphone, Pencil, Trash2, UserRound } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { CarModel, PaintColor, WheelDesign, WheelFinish } from '../../types';
import {
  BRAKE_SYSTEMS,
  BrakeSystem,
  BuildMissingError,
  GarageBuild,
  Profile,
  deleteConfiguration,
  listMyConfigurations,
  renameConfiguration,
  signOut,
  takeOAuthError,
  updateMyProfile
} from '../../services/authService';
import { forgetLocalConfiguration } from '../../services/journeyService';
import { Alert, Button, Divider, Eyebrow, Modal, Status, cx } from './ui';
import { shortModelName } from './carNames';
import { HERO_SLIDES } from './HeroStage';

export interface AccountSheetProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  profile: Profile | null;
  /** The profile as saved from the sheet (the app keeps it to prefill the enquiry and PDF forms). */
  onProfile: (profile: Profile) => void;
  /** Starts the Google sign-in (the app decides where the visitor lands back). Resolves with an error message or null. */
  onSignIn: () => Promise<string | null>;
  /** Reopens a saved build in the configurator (the app's existing ?config= flow). */
  onOpenBuild: (code: string) => Promise<boolean>;
  /** The catalogue, to describe builds and offer the primary-car choice. */
  cars: CarModel[];
  paints: PaintColor[];
  wheels: WheelDesign[];
  finishes: Record<string, WheelFinish>;
  /** Bumped when a build was saved to the garage elsewhere (the summary), so the list refreshes. */
  garageVersion?: number;
  /** Called once a build has been deleted from the garage (the app stops showing its code as saved). */
  onDeleted?: (code: string) => void;
  /** The car on stage, so the sign-in shows the same car (its welcome still); the first welcome car otherwise. */
  stageCarId?: string;
}

const fieldCls = 'mt-1.5 h-12 w-full rounded-xl bg-ink/[0.04] px-4 text-[14px] text-ink outline-none ring-1 ring-line focus:ring-gold/60 transition placeholder:text-mute/50';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">{label}</span>
    {children}
  </label>
);

/** Google's standard-colour "G" on white, as its sign-in branding guidelines require. */
const GoogleMark: React.FC = () => (
  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white">
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  </span>
);

/**
 * "Continue with Google" to Google's branding guidelines (dark theme), which app verification requires: fill #131314,
 * a 1px #8E918F inside stroke, #E3E3E3 text in Google Sans Medium 14/20 (loaded for this label in index.html), the
 * standard G on white, 12px before the logo, 10px after it and 12px after the text. Never the brand's orange button.
 */
const GoogleButton: React.FC<{ busy: boolean; onClick: () => void }> = ({ busy, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    aria-busy={busy}
    className="relative flex h-12 w-full items-center rounded-full bg-[#131314] px-3 text-[#E3E3E3] ring-1 ring-inset ring-[#8E918F] transition-colors duration-200 hover:bg-[#1f1f21] active:bg-[#28292b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-progress"
    style={{ fontFamily: "'Google Sans', Roboto, Arial, sans-serif", fontWeight: 500, fontSize: 14, lineHeight: '20px' }}
  >
    <GoogleMark />
    {/* Centred on the button, not on the space beside the logo (the logo and its gap are 34px) */}
    <span className="ml-2.5 flex-1 pr-[34px] text-center">Continue with Google</span>
    {busy && <Loader2 className="absolute right-4 h-4 w-4 animate-spin text-[#E3E3E3]/80" aria-hidden />}
  </button>
);

/** What an account is for, in the customer's terms (each line is something the app really does with it). */
const PERKS = [
  { icon: MonitorSmartphone, title: 'Every build, every device', body: 'Builds you save wait in your garage on your phone and on your computer.' },
  { icon: FileText, title: 'Your details, filled in', body: 'Your name, email and number go straight into the enquiry and PDF forms.' },
  { icon: FolderOpen, title: 'Back where you left off', body: 'Reopen any saved build exactly as you configured it.' }
] as const;

/** The car on stage, as on the welcome: a studio still that fades into the sheet. */
// The fade is on the frame, not the image: the image is taller than the frame, so a fade on it would happen
// out of sight and leave the backdrop and the floor's pool of light cut off by straight edges.
const STILL_FADE_Y = 'linear-gradient(to bottom, transparent 0%, #000 16%, #000 58%, transparent 100%)';
const STILL_FADE_X = 'linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%)';
const StageStill: React.FC<{ carId?: string }> = ({ carId }) => {
  const slide = HERO_SLIDES.find((s) => s.carId === carId) ?? HERO_SLIDES[0];
  return (
    <div
      className="relative -mx-7 h-40 overflow-hidden sm:h-44"
      aria-hidden
      style={{
        WebkitMaskImage: `${STILL_FADE_Y}, ${STILL_FADE_X}`,
        WebkitMaskComposite: 'source-in',
        maskImage: `${STILL_FADE_Y}, ${STILL_FADE_X}`,
        maskComposite: 'intersect'
      }}
    >
      <img
        src={`/hero/${slide.carId}-960.webp`}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute left-1/2 top-1/2 w-[122%] max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
      />
    </div>
  );
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

type ProfileForm = { displayName: string; phone: string; city: string; primaryCarId: string; brakeSystem: string };
const formFrom = (p: Profile | null, u: User | null): ProfileForm => ({
  displayName: p?.displayName ?? (u?.user_metadata?.full_name as string | undefined) ?? '',
  phone: p?.phone ?? '',
  city: p?.city ?? '',
  primaryCarId: p?.primaryCarId ?? '',
  brakeSystem: p?.brakeSystem ?? ''
});

const carLabel = (c: CarModel) => `${c.name}${c.generation ? ` (${c.generation})` : ''}`;

/**
 * The customer's account: Google sign-in, profile and garage of saved builds, in the viewer panel's glass
 * idiom. A full-height sheet on phones, a centred column on larger screens.
 */
export const AccountSheet: React.FC<AccountSheetProps> = (p) => {
  const signedIn = !!p.user;
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  // A sign-in that came back with an error in the URL is read (once) when the sheet opens and shown in
  // either state; closing the sheet forgets it, so it does not come back after a later sign-out.
  useEffect(() => {
    if (!p.open) {
      setSignInError(null);
      setSignInBusy(false);
      return;
    }
    const e = takeOAuthError();
    if (e) setSignInError(e);
  }, [p.open]);
  // Back from Google without a reload (the page restored from the back/forward cache keeps its state):
  // the button must offer the sign-in again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => e.persisted && setSignInBusy(false);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);
  /** Hands over to Google; on success the page leaves, so only a failure comes back here. */
  const startSignIn = async () => {
    setSignInBusy(true);
    setSignInError(null);
    let err: string | null;
    try {
      err = await p.onSignIn();
    } catch (e) {
      err = e instanceof Error ? e.message : 'Google sign-in could not be started. Please try again.';
    }
    if (err) {
      setSignInError(err);
      setSignInBusy(false);
    }
  };

  // Profile form
  const [form, setForm] = useState<ProfileForm>(() => formFrom(p.profile, p.user));
  const [profileState, setProfileState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);
  /** Fields the customer has typed in since the sheet opened: a profile arriving late must not overwrite them. */
  const touched = useRef(new Set<keyof ProfileForm>());
  // The save status lasts until the customer edits a field (setField), closes the sheet or the account changes.
  // (Before the form effect below: it must start from a clean set of touched fields.)
  useEffect(() => {
    touched.current.clear();
    setProfileState('idle');
    setProfileError(null);
  }, [p.open, p.user?.id]);
  // The fields follow the profile prop (it changes right after our own save too, when the app stores the saved
  // row, and when the app's fetch completes after the sheet was opened), so this effect refreshes the values
  // only: it must not touch the save status, or "Profile saved" would be wiped the moment it appears.
  useEffect(() => {
    setForm((f) => {
      const fresh = formFrom(p.profile, p.user);
      touched.current.forEach((k) => {
        fresh[k] = f[k];
      });
      return fresh;
    });
    // (the user's id, not the object: a token refresh must not wipe what is being typed)
  }, [p.profile, p.user?.id, p.open]);
  const setField = (k: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    touched.current.add(k);
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setProfileState('idle');
  };
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileState('saving');
    setProfileError(null);
    try {
      const saved = await updateMyProfile({
        displayName: form.displayName,
        phone: form.phone,
        city: form.city,
        primaryCarId: form.primaryCarId || null,
        brakeSystem: (form.brakeSystem || null) as BrakeSystem | null
      });
      touched.current.clear(); // the stored row is the truth again
      p.onProfile(saved);
      setProfileState('saved');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'The profile could not be saved.');
      setProfileState('error');
    }
  };

  // Garage
  const [builds, setBuilds] = useState<GarageBuild[] | null>(null);
  /** Why the list could not be loaded, or that a build acted on is gone (the list is then reloaded). */
  const [garageError, setGarageError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  /** True for the one reload a "no longer in your garage" message caused: that message stays above the fresh list. */
  const keepGarageError = useRef(false);
  const [renaming, setRenaming] = useState<{ code: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  /** The build being reopened in the configurator (its "Open" button waits). */
  const [openingCode, setOpeningCode] = useState<string | null>(null);
  /** Why the last open, rename or delete of a build failed, shown under that build. */
  const [rowError, setRowError] = useState<{ code: string; message: string } | null>(null);
  useEffect(() => {
    // A reload (open, account change, a save elsewhere, a build found gone) starts from a quiet list:
    // no editor open, no delete armed, no stale message. Closing the sheet clears them too.
    setRowError(null);
    setRenaming(null);
    setConfirmDelete(null);
    if (!p.open || !signedIn) {
      setBuilds(null);
      return;
    }
    let live = true;
    if (keepGarageError.current) keepGarageError.current = false;
    else setGarageError(null);
    listMyConfigurations()
      .then((b) => live && setBuilds(b))
      .catch((err) => live && setGarageError(err instanceof Error ? err.message : 'Your garage could not be loaded.'));
    return () => {
      live = false;
    };
  }, [p.open, signedIn, p.user?.id, p.garageVersion, refreshTick]);

  const describe = (b: GarageBuild) => {
    const car = p.cars.find((c) => c.id === b.payload.carId);
    const paint = p.paints.find((x) => x.id === b.payload.paintId);
    const wheel = p.wheels.find((w) => w.id === b.payload.wheelId);
    const finish = p.finishes[b.payload.finishId];
    return [car ? shortModelName(car) : b.payload.carId, paint?.name ?? b.payload.paintId, wheel?.name ?? b.payload.wheelId, b.payload.size, finish?.name ?? b.payload.finishId]
      .filter(Boolean)
      .join(' · ');
  };
  /** A build that is gone (deleted elsewhere, or the session lapsed): say so above the list and reload it. */
  const buildGone = (err: unknown) => {
    if (!(err instanceof BuildMissingError)) return false;
    setGarageError(err.message);
    keepGarageError.current = true;
    setRefreshTick((t) => t + 1);
    return true;
  };
  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renaming) return;
    const { code, name } = renaming;
    setBusyCode(code);
    setGarageError(null);
    setRowError(null);
    try {
      await renameConfiguration(code, name);
      setBuilds((bs) => bs?.map((b) => (b.code === code ? { ...b, name: name.trim() || null } : b)) ?? null);
      setRenaming(null);
    } catch (err) {
      if (!buildGone(err)) setRowError({ code, message: err instanceof Error ? err.message : 'The build could not be renamed.' });
    } finally {
      setBusyCode(null);
    }
  };
  const remove = async (code: string) => {
    setBusyCode(code);
    setGarageError(null);
    setRowError(null);
    try {
      await deleteConfiguration(code);
      forgetLocalConfiguration(code);
      setBuilds((bs) => bs?.filter((b) => b.code !== code) ?? null);
      setConfirmDelete(null);
      p.onDeleted?.(code);
    } catch (err) {
      // Nothing was deleted (the row is gone already, or not this session's): the local copy and the summary's code stay
      if (!buildGone(err)) setRowError({ code, message: err instanceof Error ? err.message : 'The build could not be deleted.' });
    } finally {
      setBusyCode(null);
    }
  };
  /** Reopens a build; when the app declines (its car or wheel is no longer offered, or the code is gone) the build says so. */
  const openBuild = async (code: string) => {
    setRowError(null);
    setOpeningCode(code);
    try {
      const opened = await p.onOpenBuild(code);
      if (!opened) setRowError({ code, message: 'This build can’t be opened: its car or wheel is no longer offered.' });
    } catch (err) {
      setRowError({ code, message: err instanceof Error ? err.message : 'This build could not be opened.' });
    } finally {
      setOpeningCode(null);
    }
  };

  const avatar = p.profile?.avatarUrl ?? (p.user?.user_metadata?.avatar_url as string | undefined) ?? (p.user?.user_metadata?.picture as string | undefined) ?? null;
  const name = p.profile?.displayName ?? (p.user?.user_metadata?.full_name as string | undefined) ?? '';
  const email = p.profile?.email ?? p.user?.email ?? '';
  // The cars on offer, plus the customer's stored car when it has since been hidden: a controlled select whose
  // value matches no option would show "Not set" while the form still holds (and would save) the old id.
  const carOptions = p.cars.filter((c) => c.active !== false).map((c) => ({ id: c.id, label: carLabel(c) }));
  if (form.primaryCarId && !carOptions.some((o) => o.id === form.primaryCarId)) {
    const stored = p.cars.find((c) => c.id === form.primaryCarId);
    carOptions.push({ id: form.primaryCarId, label: stored ? `${carLabel(stored)} (no longer offered)` : 'A car no longer offered' });
  }

  return (
    <Modal
      open={p.open}
      onClose={p.onClose}
      title={signedIn ? 'Your garage' : 'Sign in'}
      width="max-w-md"
      panelClassName="bg-surface/[0.82] backdrop-blur-xl ring-1 ring-line rounded-none sm:rounded-[14px] h-[100dvh] sm:h-auto sm:max-h-[88dvh]"
    >
      {!signedIn ? (
        // Full height on phones (the sheet is the screen there), so the button sits low, within thumb reach
        <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col sm:min-h-0">
          <StageStill carId={p.stageCarId} />
          <Eyebrow className="mt-2 text-gold">{BRAND.name} garage</Eyebrow>
          <h3 className="mt-2.5 font-display text-[27px] font-extrabold leading-[1.06] tracking-[-0.025em] text-ink">Keep every build you make</h3>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-mute">Sign in to save your builds and pick them up again on any device.</p>
          <ul className="mt-6 space-y-4">
            {PERKS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/[0.08] ring-1 ring-gold/35">
                  <Icon className="h-4 w-4 text-gold" strokeWidth={1.7} aria-hidden />
                </span>
                <div className="min-w-0 pt-0.5">
                  <div className="text-[13.5px] font-semibold text-ink">{title}</div>
                  <div className="mt-0.5 text-[12.5px] leading-relaxed text-mute">{body}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8 sm:pt-7">
            <GoogleButton busy={signInBusy} onClick={startSignIn} />
            {signInError && <Alert className="mt-3">{signInError}</Alert>}
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-mute">
              <Lock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden /> Google signs you in. We never see your password.
            </p>
            <button
              type="button"
              onClick={p.onClose}
              className="mt-4 h-11 w-full rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] text-mute transition hover:bg-ink/[0.05] hover:text-ink"
            >
              Not now, keep configuring
            </button>
            <p className="mt-4 text-center text-[11px] leading-relaxed text-mute/80">
              We store your name, email and saved builds to run your garage. Delete your account any time via{' '}
              <a href={`mailto:${BRAND.contact.email}`} className="underline decoration-line underline-offset-2 hover:text-gold">
                {BRAND.contact.email}
              </a>{' '}
              or the enquiry form.
            </p>
          </div>
        </div>
      ) : (
        <div className="pb-2">
          {/* Who */}
          <div className="flex items-center gap-4">
            {avatar ? (
              <img src={avatar} alt="" referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-line" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] ring-1 ring-line">
                <UserRound className="h-6 w-6 text-mute" strokeWidth={1.5} />
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate font-display text-[17px] font-bold tracking-[-0.01em]">{name || email}</div>
              <div className="truncate text-[12.5px] text-mute">{email}</div>
            </div>
          </div>
          {signInError && <Alert className="mt-3">{signInError}</Alert>}

          {/* Profile */}
          <form onSubmit={saveProfile} className="mt-7 space-y-4">
            <Eyebrow>Profile</Eyebrow>
            <Field label="Display name">
              <input value={form.displayName} onChange={setField('displayName')} autoComplete="name" maxLength={80} className={fieldCls} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <input type="tel" value={form.phone} onChange={setField('phone')} autoComplete="tel" placeholder="082 123 4567" maxLength={40} className={fieldCls} />
              </Field>
              <Field label="City">
                <input value={form.city} onChange={setField('city')} autoComplete="address-level2" maxLength={120} className={fieldCls} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your car">
                <select value={form.primaryCarId} onChange={setField('primaryCarId')} className={fieldCls}>
                  <option value="">Not set</option>
                  {carOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Brake system">
                <select value={form.brakeSystem} onChange={setField('brakeSystem')} className={fieldCls}>
                  <option value="">Not set</option>
                  {BRAKE_SYSTEMS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {profileError && <Alert>{profileError}</Alert>}
            <Button type="submit" variant="secondary" className="w-full" disabled={profileState === 'saving'} icon={profileState === 'saved' ? <Check className="h-4 w-4" /> : undefined}>
              {profileState === 'saving' ? 'Saving…' : profileState === 'saved' ? 'Profile saved' : 'Save profile'}
            </Button>
            {/* The button's label swap is not read out by every screen reader; this live region is */}
            <Status className="sr-only">{profileState === 'saving' ? 'Saving your profile…' : profileState === 'saved' ? 'Profile saved' : ''}</Status>
          </form>

          <Divider className="my-7" />

          {/* Garage */}
          <div className="flex items-baseline justify-between">
            <Eyebrow>Garage</Eyebrow>
            {builds && builds.length > 0 && <span className="text-[11px] text-mute">{builds.length} saved</span>}
          </div>
          {garageError && <Alert className="mt-3">{garageError}</Alert>}
          {/* Mounted throughout, as a live region should be (a plain <p>: the Status wrapper's 12.5px would change this 13px line) */}
          <p role="status" aria-live="polite" aria-atomic="true" className={cx('text-[13px] text-mute', !builds && !garageError && 'mt-3')}>
            {!builds && !garageError ? 'Loading your builds…' : ''}
          </p>
          {builds && builds.length === 0 && (
            <p className="mt-3 text-[13px] leading-relaxed text-mute">
              Nothing saved yet. Configure a car, open the summary and use “Save to garage” next to your configuration code.
            </p>
          )}
          {builds && builds.length > 0 && (
            <ul className="mt-3 space-y-2.5">
              {builds.map((b) => {
                const label = b.name || b.code;
                const busy = busyCode === b.code;
                const opening = openingCode === b.code;
                return (
                  <li key={b.code} className="rounded-[14px] bg-ink/[0.035] ring-1 ring-line p-4">
                    {renaming?.code === b.code ? (
                      <form onSubmit={rename} className="flex gap-2">
                        <input
                          autoFocus
                          aria-label="Build name"
                          value={renaming.name}
                          maxLength={80}
                          onChange={(e) => setRenaming({ code: b.code, name: e.target.value })}
                          onKeyDown={(e) => {
                            // Escape cancels the rename only (the sheet's own Escape handler listens on window)
                            if (e.key !== 'Escape') return;
                            e.stopPropagation();
                            setRenaming(null);
                          }}
                          className="h-10 min-w-0 flex-1 rounded-xl bg-ink/[0.04] px-3 text-[13.5px] text-ink outline-none ring-1 ring-line focus:ring-gold/60"
                        />
                        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                          {busy ? 'Saving…' : 'Save'}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(null)}>
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={cx('truncate text-[14.5px] font-semibold', !b.name && 'font-mono tracking-[0.14em]')}>{label}</div>
                          <div className="mt-0.5 truncate text-[12px] text-mute">{describe(b)}</div>
                          <div className="mt-0.5 text-[11px] text-mute/80">
                            {formatDate(b.createdAt)}
                            {b.name && <span className="font-mono tracking-[0.1em]"> · {b.code}</span>}
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" className="shrink-0" aria-label={`Open ${label}`} disabled={busy || opening} onClick={() => openBuild(b.code)} icon={<FolderOpen className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                          {opening ? 'Opening…' : 'Open'}
                        </Button>
                      </div>
                    )}
                    {rowError?.code === b.code && <Alert className="mt-2">{rowError.message}</Alert>}
                    {confirmDelete === b.code ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                        <span className="text-mute">Delete this build from your garage?</span>
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => remove(b.code)} className="ring-red-400/50 text-red-400">
                          {busy ? 'Deleting…' : 'Delete'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                          Keep
                        </Button>
                      </div>
                    ) : (
                      renaming?.code !== b.code && (
                        <div className="mt-2 flex gap-1">
                          <button
                            onClick={() => {
                              setConfirmDelete(null);
                              setRenaming({ code: b.code, name: b.name ?? '' });
                            }}
                            aria-label={`Rename ${label}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-mute hover:text-ink hover:bg-ink/[0.06] transition"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} /> Rename
                          </button>
                          <button
                            onClick={() => {
                              setRenaming(null);
                              setConfirmDelete(b.code);
                            }}
                            aria-label={`Delete ${label}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-mute hover:text-red-400 hover:bg-ink/[0.06] transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} /> Delete
                          </button>
                        </div>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <Divider className="my-7" />
          <div className="flex items-center justify-between gap-4">
            <p className="text-[11px] leading-relaxed text-mute">
              Your name, email and builds are stored to run this garage. To delete your account, write to{' '}
              <a href={`mailto:${BRAND.contact.email}`} className="underline decoration-line underline-offset-2 hover:text-gold">
                {BRAND.contact.email}
              </a>
              .
            </p>
            <Button variant="ghost" size="sm" className="shrink-0" aria-label="Sign out" onClick={() => signOut()} icon={<LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />}>
              Sign out
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
