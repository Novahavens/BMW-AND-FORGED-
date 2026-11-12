/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Download, Mail, Share2, Warehouse } from 'lucide-react';
import { BRAND, Region, formatMoney } from '../../config/brand';
import { CarModel, PaintColor, WheelDesign, WheelFinish } from '../../types';
import { PdfContact, rememberPdfContact, rememberedPdfContact, shareUrl } from '../../services/journeyService';
import { finishSurcharge, rimPrice } from '../../services/pricing';
import { Alert, Button, Eyebrow, FinishChip, Logo, Modal, PaintChip, RimThumb, Status, cx } from './ui';
import { SiteFooter } from '../SiteFooter';
import { shortModelName } from './carNames';

export interface SummaryProps {
  car: CarModel;
  paint: PaintColor;
  wheel: WheelDesign;
  finish: WheelFinish;
  size: string;
  price: number;
  region: Region;
  images: string[];
  code: string | null;
  /** undefined: the shared copy is still being saved; false: it could not be (the code works on this device only). */
  codeShared?: boolean;
  onBack: () => void;
  onEnquire: () => void;
  /** Saves the contact as a lead, then builds the PDF. */
  onDownloadPdf: (contact: PdfContact) => Promise<void>;
  /** Customer accounts: signed in, "Save to garage" names the build and keeps it; signed out, the button
   * reads "Sign in to save" and opens the sign-in. Omit onSaveToGarage to hide the button. Resolves true
   * once the build is in the garage, else the message to show the customer. */
  signedIn?: boolean;
  onSaveToGarage?: (name: string) => Promise<true | string>;
  onSignIn?: () => void;
  /** The signed-in customer's details, offered in the PDF form for the fields still blank. */
  contactPrefill?: Partial<PdfContact>;
}

export const SummaryPage: React.FC<SummaryProps> = (p) => {
  const [tab, setTab] = useState<'selected' | 'standard'>('selected');
  const [share, setShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const name = shortModelName(p.car);

  // The PDF is gated on an email address and mobile number (saved as a lead with the build).
  const [gate, setGate] = useState(false);
  const [contact, setContact] = useState<PdfContact>(rememberedPdfContact);
  const [gateError, setGateError] = useState<string | null>(null);
  const downloadPdf = () => {
    setShare(false);
    setGateError(null);
    setGate(true);
  };
  const submitGate = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = contact.email.trim();
    const phone = contact.phone.replace(/[\s()-]/g, '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setGateError('Please enter a valid email address.');
    if (!/^\+?\d{9,15}$/.test(phone)) return setGateError('Please enter a valid mobile number, e.g. 082 123 4567.');
    const clean = { name: contact.name.trim(), email, phone: contact.phone.trim() };
    rememberPdfContact(clean);
    setPdfBusy(true);
    try {
      await p.onDownloadPdf(clean);
      setGate(false);
    } catch (err) {
      setGateError(err instanceof Error && err.message ? err.message : 'The PDF could not be created. Please try again.');
    } finally {
      setPdfBusy(false);
    }
  };
  const setField = (k: keyof PdfContact) => (e: React.ChangeEvent<HTMLInputElement>) => setContact((c) => ({ ...c, [k]: e.target.value }));
  // A signed-in customer's profile fills the blanks (what they typed, or remembered here, stays)
  useEffect(() => {
    const pre = p.contactPrefill;
    if (!pre) return;
    setContact((c) => ({ name: c.name || pre.name || '', email: c.email || pre.email || '', phone: c.phone || pre.phone || '' }));
  }, [p.contactPrefill]);

  // Save to garage: the build gets a name (default "<badge> · <wheel>") and goes under the customer's account
  const [garage, setGarage] = useState<'idle' | 'naming' | 'saving' | 'saved'>('idle');
  const [garageName, setGarageName] = useState('');
  const [garageError, setGarageError] = useState<string | null>(null);
  // A new code means another build is on screen (or this one got a fresh code after its saved copy was
  // deleted), so "Saved" no longer applies... except when the new code is the owned copy our own save just
  // produced (the parent swaps it in as the save succeeds, in the same render that turns 'saving' into
  // 'saved'): then the confirmation stays. The refs read the garage state at the time of the change, and
  // the one before it, without re-running on them.
  const garageRef = useRef(garage);
  garageRef.current = garage;
  const prevGarage = useRef(garage); // the state of the previous commit (updated by the effect below, after this one)
  useEffect(() => {
    if (garageRef.current === 'saving') return;
    if (garageRef.current === 'saved' && prevGarage.current !== 'saved') return;
    setGarage('idle');
    setGarageError(null);
  }, [p.code]);
  useEffect(() => {
    prevGarage.current = garage;
  }, [garage]);
  const startGarage = () => {
    if (!p.signedIn) {
      setShare(false);
      p.onSignIn?.();
      return;
    }
    setGarageName(`${p.car.badge} · ${p.wheel.name}`);
    setGarageError(null);
    setGarage('naming');
  };
  const saveToGarage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p.onSaveToGarage || !p.code) return;
    setGarage('saving');
    try {
      const result = await p.onSaveToGarage(garageName.trim() || `${p.car.badge} · ${p.wheel.name}`);
      if (result === true) setGarage('saved');
      else {
        // the parent says why (not on the server yet, or garages not switched on for this site)
        setGarage('naming');
        setGarageError(result || 'The build could not be saved to your garage.');
      }
    } catch (err) {
      setGarage('naming');
      setGarageError(err instanceof Error && err.message ? err.message : 'The build could not be saved to your garage.');
    }
  };

  // The size row carries the base-finish set price and the finish row what the finish adds (the total,
  // p.price, is finish-inclusive), so the two line items add up to the total card
  const surcharge = finishSurcharge(p.wheel, p.size, p.finish.id);
  const options = [
    { label: 'Paint', value: p.paint.name, detail: `${p.paint.type} · ${p.paint.code}`, visual: <PaintChip paint={p.paint} size={52} />, price: 'Included' },
    { label: 'Wheel design', value: p.wheel.name, detail: p.wheel.style, visual: <RimThumb wheel={p.wheel} finish={p.finish} size={60} />, price: null },
    { label: 'Wheel size', value: p.size, detail: 'Set of four', visual: <span className="font-display text-[18px] font-extrabold">{p.size}</span>, price: formatMoney(rimPrice(p.wheel, p.size), p.region) },
    { label: 'Wheel finish', value: p.finish.name, detail: p.finish.colorName, visual: <FinishChip finish={p.finish} size={52} />, price: surcharge > 0 ? `+${formatMoney(surcharge, p.region)}` : 'Included' }
  ];

  // Blank specs (cars listed without them) are left out rather than shown as empty rows
  const fit = p.car.recommendedWheelFitment ?? { front: '', rear: '', pcd: '', cb: '' };
  const standard = (
    [
      ['Engine', p.car.engine],
      ['Power', p.car.power],
      ['Torque', p.car.torque],
      ['Acceleration', p.car.acceleration],
      ['Factory fitment', [fit.front, fit.rear].filter((v) => v?.trim()).join(' / ')],
      ['Bolt pattern', [fit.pcd, fit.cb && `CB ${fit.cb}`].filter((v) => v?.trim()).join(' · ')]
    ] as [string, string][]
  ).filter(([, v]) => v?.trim());

  return (
    <div className="absolute inset-0 z-50 overflow-y-auto bg-carbon animate-fade">
      <header className="sticky top-0 z-20 flex h-16 sm:h-20 items-center justify-between bg-carbon/85 backdrop-blur-xl px-4 sm:px-8 border-b border-line">
        <Button variant="ghost" size="sm" onClick={p.onBack} className="pl-2">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          <span className="hidden sm:inline">Return to configuration</span>
          <span className="sm:hidden">Back</span>
        </Button>
        <div className="absolute left-1/2 -translate-x-1/2">
          <Logo size="sm" />
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShare(true)} icon={<Share2 className="h-3.5 w-3.5" strokeWidth={1.8} />}>
          <span className="hidden sm:inline">Share summary</span>
          <span className="sm:hidden">Share</span>
        </Button>
      </header>

      <div className="mx-auto max-w-6xl px-5 sm:px-8 pb-24">
        <section className="pt-10 sm:pt-14">
          <Eyebrow className="animate-rise">{BRAND.descriptor}</Eyebrow>
          <h1 className="mt-3 font-display text-[36px] sm:text-[60px] font-extrabold leading-[1.02] tracking-[-0.035em] animate-rise delay-100">
            Your {p.car.name.replace(/^BMW /, 'BMW ')}
          </h1>
          <p className="mt-3 text-[14px] text-mute animate-rise delay-200">
            {p.paint.name} with {p.size} {p.wheel.name} in {p.finish.name}
          </p>
        </section>

        <div className="mt-8 overflow-hidden rounded-[28px] bg-studio animate-rise delay-200">
          {p.images[0] ? <img src={p.images[0]} alt={`Your ${p.car.name}`} className="w-full aspect-[16/9] object-cover" /> : <div className="aspect-[16/9]" />}
        </div>
        {p.images.length > 1 && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {p.images.slice(1).map((src, i) => (
              <div key={i} className="overflow-hidden rounded-[22px] bg-studio animate-rise" style={{ animationDelay: `${300 + i * 100}ms` }}>
                <img src={src} alt="" className="w-full aspect-[16/10] object-cover" />
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="flex gap-6 sm:gap-8 border-b border-line">
              {(['selected', 'standard'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cx(
                    'relative pt-2 pb-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.2em] transition',
                    tab === t ? 'text-ink' : 'text-mute hover:text-ink'
                  )}
                >
                  {t === 'selected' ? 'Selected options' : 'Standard features'}
                  {tab === t && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-gold" />}
                </button>
              ))}
            </div>

            {tab === 'selected' ? (
              <ul key="sel" className="mt-6 grid gap-3 sm:grid-cols-2 animate-fade">
                {options.map((o) => (
                  <li key={o.label} className="flex items-center gap-4 rounded-[20px] ring-1 ring-line p-5">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center">{o.visual}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">{o.label}</span>
                      <span className="mt-1 block truncate text-[15px] font-semibold">{o.value}</span>
                      <span className="block truncate text-[12px] text-mute">{o.detail}</span>
                    </span>
                    {o.price && <span className="shrink-0 text-[12px] text-mute tabular-nums">{o.price}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <div key="std" className="mt-6 animate-fade">
                {standard.length > 0 && (
                  <dl className="mb-8 grid gap-px overflow-hidden rounded-[20px] bg-line ring-1 ring-line sm:grid-cols-2">
                    {standard.map(([k, v], i) => (
                      <div key={k} className={cx('bg-surface p-5', i === standard.length - 1 && standard.length % 2 === 1 && 'sm:col-span-2')}>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">{k}</dt>
                        <dd className="mt-1.5 text-[14px] font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <Eyebrow className="mb-3">Every {p.wheel.code} set</Eyebrow>
                <ul className="space-y-2.5">
                  {p.wheel.highlights.map((h) => (
                    <li key={h} className="flex gap-3 text-[14px]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-bronze" strokeWidth={2} />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-28 h-fit rounded-[24px] bg-gunmetal text-white ring-1 ring-gold/25 p-7">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">Wheel set of four</div>
            <div className="mt-2 font-display text-[36px] font-extrabold tracking-[-0.02em] tabular-nums">{formatMoney(p.price, p.region)}</div>
            <div className="mt-1 text-[12px] text-white/60">
              {p.wheel.name} · {p.size} · {p.finish.name}
            </div>
            <Button variant="secondary" size="lg" className="mt-7 w-full ring-0" onClick={p.onEnquire} icon={<Mail className="h-4 w-4" strokeWidth={1.8} />}>
              Enquire
            </Button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setShare(true)}
                className="h-11 rounded-full ring-1 ring-white/20 text-[10.5px] font-semibold uppercase tracking-[0.14em] hover:bg-white/10 transition"
              >
                Share
              </button>
              <button
                onClick={downloadPdf}
                disabled={pdfBusy}
                className="h-11 rounded-full ring-1 ring-white/20 text-[10.5px] font-semibold uppercase tracking-[0.14em] hover:bg-white/10 transition disabled:opacity-50"
              >
                {pdfBusy ? 'Preparing…' : 'PDF'}
              </button>
            </div>
            {/* The owner's visualisation notice (it was the showroom's Build confirmation until the showroom went) */}
            <p className="mt-6 text-[11px] leading-relaxed text-white/50">{BRAND.visualisationNotice}</p>
          </aside>
        </div>

        <div className="mt-16 flex justify-center">
          <Button variant="secondary" onClick={p.onBack}>
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
            Return to configuration
          </Button>
        </div>
      </div>

      <SiteFooter className="mt-16" />

      <Modal open={share} onClose={() => setShare(false)} title="Share summary" width="max-w-md">
        <p className="text-[13.5px] leading-relaxed text-mute">
          Use this code to reopen your {name} configuration at any time, or share the link.
        </p>
        <div className="mt-5 rounded-2xl bg-ink/[0.04] py-6 text-center">
          <Eyebrow>Configuration code</Eyebrow>
          <div className="mt-2 font-mono text-[26px] font-semibold tracking-[0.22em]">{p.code ?? '··········'}</div>
          {/* One live region, mounted throughout, so the swap from "Saving…" to the device-only note is announced
              (kept as a plain <p>: the Status wrapper's 12.5px would change this 11px note) */}
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cx('text-[11px] leading-relaxed text-mute', p.code && p.codeShared === undefined && 'mt-2', p.codeShared === false && 'mx-6 mt-2')}
          >
            {p.code && p.codeShared === undefined
              ? 'Saving your build…'
              : p.codeShared === false
                ? "Saved on this device only: the connection didn't allow a shared copy, so the link may not open elsewhere yet."
                : ''}
          </p>
        </div>
        {p.onSaveToGarage && (
          <div className="mt-4">
            {garage === 'naming' || garage === 'saving' ? (
              <form onSubmit={saveToGarage} className="flex gap-2">
                <input
                  autoFocus
                  aria-label="Build name"
                  value={garageName}
                  maxLength={80}
                  onChange={(e) => setGarageName(e.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-full bg-ink/[0.04] px-5 text-[13.5px] outline-none ring-1 ring-line focus:ring-gold/60 transition"
                />
                <Button type="submit" variant="secondary" disabled={garage === 'saving' || !p.code}>
                  {garage === 'saving' ? 'Saving…' : 'Save'}
                </Button>
              </form>
            ) : (
              <Button
                variant="secondary"
                className="w-full"
                aria-label={p.signedIn ? 'Save to garage' : 'Sign in to save'}
                onClick={startGarage}
                icon={garage === 'saved' ? <Check className="h-4 w-4" /> : <Warehouse className="h-4 w-4" strokeWidth={1.7} />}
              >
                {garage === 'saved' ? 'Saved to your garage' : p.signedIn ? 'Save to garage' : 'Sign in to save'}
              </Button>
            )}
            {garageError && <Alert className="mt-2">{garageError}</Alert>}
            {/* The naming form (and its focused Save button) is replaced by the "Saved" button: say so */}
            <Status className="sr-only">{garage === 'saving' ? 'Saving to your garage…' : garage === 'saved' ? 'Saved to your garage' : ''}</Status>
          </div>
        )}
        <div className="mt-5 grid gap-2.5">
          <Button
            variant="secondary"
            disabled={!p.code}
            onClick={async () => {
              if (!p.code) return;
              try {
                await navigator.clipboard.writeText(shareUrl(p.code));
              } catch {
                /* clipboard blocked: the code is on screen */
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
            icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" strokeWidth={1.7} />}
          >
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
          <Button onClick={downloadPdf} disabled={pdfBusy || !p.code} icon={<Download className="h-4 w-4" strokeWidth={1.7} />}>
            {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
          </Button>
        </div>
        {/* The button label swap alone is not read out by every screen reader */}
        <Status className="sr-only">{copied ? 'Link copied' : ''}</Status>
      </Modal>

      <Modal open={gate} onClose={() => !pdfBusy && setGate(false)} title="Download your PDF" width="max-w-md">
        <form onSubmit={submitGate} className="space-y-4">
          <p className="text-[13.5px] leading-relaxed text-mute">
            Enter your email address and mobile number and your {name} build sheet downloads straight away. We use them only to
            follow up on this configuration.
          </p>
          <GateField label="Email address" type="email" required autoComplete="email" value={contact.email} onChange={setField('email')} />
          <GateField label="Mobile number" type="tel" required autoComplete="tel" placeholder="082 123 4567" value={contact.phone} onChange={setField('phone')} />
          <GateField label="Name (optional)" autoComplete="name" value={contact.name} onChange={setField('name')} />
          {gateError && <Alert>{gateError}</Alert>}
          <Button type="submit" size="lg" className="w-full" disabled={pdfBusy} icon={<Download className="h-4 w-4" strokeWidth={1.7} />}>
            {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
          </Button>
          <Status className="sr-only">{pdfBusy ? 'Preparing your PDF…' : ''}</Status>
          <p className="text-[11px] leading-relaxed text-mute">
            By continuing you agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2 hover:text-gold">
              terms and privacy notice
            </a>
            .
          </p>
        </form>
      </Modal>
    </div>
  );
};

const GateField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...rest }) => (
  <label className="block">
    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">{label}</span>
    <input
      {...rest}
      className="mt-1.5 h-12 w-full rounded-xl bg-ink/[0.04] px-4 text-[14px] outline-none ring-1 ring-line focus:ring-gold/60 transition placeholder:text-mute/50"
    />
  </label>
);
