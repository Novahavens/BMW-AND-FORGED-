/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ArrowLeft, Check, Copy, Download, Mail, Share2 } from 'lucide-react';
import { BRAND, Region, formatMoney } from '../../config/brand';
import { CarModel, PaintColor, WheelDesign, WheelFinish } from '../../types';
import { PdfContact, rememberPdfContact, rememberedPdfContact, shareUrl } from '../../services/journeyService';
import { Button, Eyebrow, FinishChip, Logo, Modal, PaintChip, RimThumb, cx } from './ui';
import { SiteFooter } from '../SiteFooter';
import { shortModelName } from './Showroom';

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
  onBack: () => void;
  onEnquire: () => void;
  /** Saves the contact as a lead, then builds the PDF. */
  onDownloadPdf: (contact: PdfContact) => Promise<void>;
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
    } catch {
      setGateError('The PDF could not be created. Please try again.');
    } finally {
      setPdfBusy(false);
    }
  };
  const setField = (k: keyof PdfContact) => (e: React.ChangeEvent<HTMLInputElement>) => setContact((c) => ({ ...c, [k]: e.target.value }));

  const options = [
    { label: 'Paint', value: p.paint.name, detail: `${p.paint.type} · ${p.paint.code}`, visual: <PaintChip paint={p.paint} size={52} />, price: 'Included' },
    { label: 'Wheel design', value: p.wheel.name, detail: p.wheel.style, visual: <RimThumb wheel={p.wheel} finish={p.finish} size={60} />, price: null },
    { label: 'Wheel size', value: p.size, detail: 'Set of four', visual: <span className="font-display text-[18px] font-extrabold">{p.size}</span>, price: formatMoney(p.price, p.region) },
    { label: 'Wheel finish', value: p.finish.name, detail: p.finish.colorName, visual: <FinishChip finish={p.finish} size={52} />, price: 'Included' }
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

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="flex gap-8 border-b border-line">
              {(['selected', 'standard'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cx(
                    'relative pb-4 text-[11px] font-semibold uppercase tracking-[0.2em] transition',
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
            <p className="mt-6 text-[11px] leading-relaxed text-white/50">Visualisation only. Final specification, fitment and price are confirmed with our team.</p>
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
        </div>
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
          {gateError && <p className="text-[12.5px] text-red-400">{gateError}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={pdfBusy} icon={<Download className="h-4 w-4" strokeWidth={1.7} />}>
            {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
          </Button>
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
