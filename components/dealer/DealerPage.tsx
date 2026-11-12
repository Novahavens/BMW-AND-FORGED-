/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Building2, Loader2, LogOut } from 'lucide-react';
import { supabase, authFlags } from '../../services/supabaseClient';
import { signInWithGoogle } from '../../services/authService';
import { Dealer, getMyDealer } from '../../services/dealerService';
import { Centered, LoginForm, SetPasswordForm } from '../admin/AdminPage';
import { EnquiriesPanel } from '../admin/EnquiriesPanel';

const identityOf = (s: Session | null) => (s ? `${s.user.id}\n${s.user.email ?? ''}` : null);

/**
 * /dealer: a dealership's own view. Sign in (email + password, or Google), then see only the enquiries FORGED
 * assigned to the dealership: status and notes, Reply, Open build, CSV. No catalogue, no prices (those are
 * FORGED's, in /admin). Who counts as a dealer is decided in the database (public.my_dealer()), not here.
 */
export const DealerPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [recovering, setRecovering] = useState(authFlags.passwordRecovery);
  const [dealer, setDealer] = useState<Dealer | null | undefined>(undefined); // undefined = checking
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const adopt = (s: Session | null) => setSession((prev) => (identityOf(prev) === identityOf(s) ? prev : s));
    supabase.auth
      .getSession()
      .then(({ data }) => adopt(data.session))
      // a failed session read counts as signed out, so the sign-in form shows instead of the spinner forever
      .catch(() => adopt(null))
      .finally(() => setAuthChecked(true));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY') adopt(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const identity = identityOf(session);
  useEffect(() => {
    let cancelled = false;
    setDealer(undefined);
    setError(null);
    if (identity) {
      getMyDealer()
        .then((d) => !cancelled && setDealer(d))
        .catch((e: Error) => {
          if (cancelled) return;
          setError(e.message);
          setDealer(null);
        });
    }
    return () => { cancelled = true; };
  }, [identity]);

  const [googleError, setGoogleError] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 overflow-y-auto bg-black text-neutral-200 select-text">
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/90 backdrop-blur">
        <button onClick={onBack} className="flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to studio
        </button>
        <div className="flex items-center gap-2 text-sm font-bold tracking-widest uppercase">
          <Building2 className="w-4 h-4 text-[#CF9F52]" /> {dealer ? dealer.name : 'FORGEDSA Dealer'}
        </div>
        {session ? (
          <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-400 hover:text-white">
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
        <LoginForm
          returnPath="/dealer"
          title="Dealer sign in"
          blurb="See the enquiries FORGED has passed to your dealership."
        >
          <button
            type="button"
            onClick={async () => setGoogleError(await signInWithGoogle('/dealer'))}
            className="w-full rounded-md border border-white/10 py-2 text-sm text-neutral-200 hover:border-[#CF9F52]"
          >
            Continue with Google
          </button>
          {googleError && <p className="text-xs text-red-400">{googleError}</p>}
        </LoginForm>
      ) : dealer === undefined ? (
        <Centered><Loader2 className="w-6 h-6 animate-spin text-[#CF9F52]" /></Centered>
      ) : !dealer ? (
        <Centered>
          <p className="text-sm text-neutral-400 text-center max-w-sm">
            {error ?? `${session.user.email} is signed in but is not set up as a dealer, or its dealership is switched off. Ask FORGED to add this email.`}
          </p>
        </Centered>
      ) : (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <EnquiriesPanel mode="dealer" />
        </div>
      )}
    </div>
  );
};
