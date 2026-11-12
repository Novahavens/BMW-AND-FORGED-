/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check, CloudOff } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { Enquiry, submitEnquiry } from '../../services/journeyService';
import { Alert, Button, Modal } from './ui';

const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...rest }) => (
  <label className="block">
    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">{label}</span>
    <input
      {...rest}
      className="mt-1.5 h-12 w-full rounded-xl bg-ink/[0.04] px-4 text-[14px] outline-none ring-1 ring-transparent focus:ring-ink/25 transition"
    />
  </label>
);

export const EnquiryModal: React.FC<{
  open: boolean;
  onClose: () => void;
  summary: string;
  context: Omit<Enquiry, 'name' | 'email' | 'phone' | 'message' | 'consultation'>;
  /** A signed-in customer's details, filled into the fields still blank when the form opens. */
  prefill?: { name?: string; email?: string; phone?: string };
}> = ({ open, onClose, summary, context, prefill }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', consultation: true });
  /** 'saved-locally': the server could not be reached and the enquiry only exists in this browser. */
  const [view, setView] = useState<'form' | 'done' | 'saved-locally'>('form');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped on every send and on close, so a result landing after the modal was closed (or after a
   * newer send) is dropped instead of flipping a fresh modal to "Thank you". */
  const attempt = useRef(0);
  /** The result view's message. The form (and the submit button that had focus) is gone once the enquiry is
   * sent or saved locally, so focus moves here and the outcome is read out instead of dropping to <body>. */
  const resultRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (view !== 'form') resultRef.current?.focus();
  }, [view]);
  // The prefill is read through a ref so the fill runs once per opening, not on every identity change
  // of the prop (App recomputes it when the profile loads or the token refreshes while the modal is open).
  const prefillRef = useRef(prefill);
  useEffect(() => {
    prefillRef.current = prefill;
  }, [prefill]);
  useEffect(() => {
    if (!open) {
      attempt.current++;
      setSending(false);
      setView('form');
      setError(null);
      return;
    }
    const p = prefillRef.current;
    if (!p) return;
    // Only the fields still blank: never over what the customer typed
    setForm((f) => ({ ...f, name: f.name || p.name || '', email: f.email || p.email || '', phone: f.phone || p.phone || '' }));
  }, [open]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: k === 'consultation' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const close = () => onClose();

  const send = async () => {
    const id = ++attempt.current;
    setSending(true);
    setError(null);
    const sent = { ...context, ...form };
    const result = await submitEnquiry(sent);
    // A sent message is not offered again on the next enquiry (left alone if the customer has since retyped it)
    if (result.status === 'sent') setForm((f) => (f.message === sent.message ? { ...f, message: '' } : f));
    if (id !== attempt.current) return; // closed or resubmitted meanwhile
    setSending(false);
    if (result.status === 'rejected') {
      setError(result.message);
      setView('form');
      return;
    }
    setView(result.status === 'sent' ? 'done' : 'saved-locally');
  };

  return (
    <Modal open={open} onClose={close} title={view === 'done' ? 'Thank you' : view === 'saved-locally' ? 'Not sent yet' : 'Enquire'} width="max-w-lg">
      {view === 'saved-locally' ? (
        <div className="py-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink/[0.06] text-ink">
            <CloudOff className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <p ref={resultRef} tabIndex={-1} className="mt-5 text-[14px] leading-relaxed text-mute outline-none">
            We couldn't reach our server, so your enquiry is saved on this device only. Please email{' '}
            <a href={`mailto:${BRAND.contact.email}`} className="text-ink underline underline-offset-2">
              {BRAND.contact.email}
            </a>{' '}
            or try again in a moment.
          </p>
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
            <Button onClick={() => void send()} disabled={sending}>
              {sending ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
        </div>
      ) : view === 'done' ? (
        <div className="py-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold text-carbon">
            <Check className="h-6 w-6" strokeWidth={2} />
          </div>
          <p ref={resultRef} tabIndex={-1} className="mt-5 text-[14px] leading-relaxed text-mute outline-none">
            We have your configuration and will be in touch shortly{form.name ? `, ${form.name.split(' ')[0]}` : ''}.
          </p>
          <Button className="mt-7" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="rounded-2xl bg-ink/[0.035] px-4 py-3 text-[12.5px] leading-relaxed text-mute">{summary}</div>
          <Field label="Full name" required value={form.name} onChange={set('name')} autoComplete="name" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
            <Field label="Phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
          </div>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">Message</span>
            <textarea
              value={form.message}
              onChange={set('message')}
              rows={3}
              className="mt-1.5 w-full rounded-xl bg-ink/[0.04] px-4 py-3 text-[14px] outline-none ring-1 ring-transparent focus:ring-ink/25 transition resize-none"
            />
          </label>
          <label className="flex items-center gap-3 text-[13px] text-ink cursor-pointer">
            <input type="checkbox" checked={form.consultation} onChange={set('consultation')} className="h-4 w-4 accent-[#CF9F52]" />
            I'd like a fitment consultation
          </label>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" size="lg" className="w-full" disabled={sending}>
            {sending ? 'Sending…' : 'Send enquiry'}
          </Button>
        </form>
      )}
    </Modal>
  );
};
