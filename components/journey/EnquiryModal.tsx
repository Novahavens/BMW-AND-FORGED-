/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Enquiry, submitEnquiry } from '../../services/journeyService';
import { Button, Modal } from './ui';

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
}> = ({ open, onClose, summary, context }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', consultation: true });
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: k === 'consultation' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const close = () => {
    onClose();
    setTimeout(() => setState('idle'), 300);
  };

  return (
    <Modal open={open} onClose={close} title={state === 'done' ? 'Thank you' : 'Enquire'} width="max-w-lg">
      {state === 'done' ? (
        <div className="py-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold text-carbon">
            <Check className="h-6 w-6" strokeWidth={2} />
          </div>
          <p className="mt-5 text-[14px] leading-relaxed text-mute">
            We have your configuration and will be in touch shortly{form.name ? `, ${form.name.split(' ')[0]}` : ''}.
          </p>
          <Button className="mt-7" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setState('sending');
            await submitEnquiry({ ...context, ...form });
            setState('done');
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
          <Button type="submit" size="lg" className="w-full" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Send enquiry'}
          </Button>
        </form>
      )}
    </Modal>
  );
};
