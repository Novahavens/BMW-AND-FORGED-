/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowLeft, ArrowRight, Rotate3d } from 'lucide-react';
import { BRAND, Region, formatMoney } from '../config/brand';
import { WheelDesign, WheelFinish } from '../types';
import { rimFromPrice, rimSizes } from '../services/pricing';
import { Button, Eyebrow, Logo, RimThumb } from './journey/ui';
import { RimFaceSvg } from './journey/RimFaceSvg';
import { SiteFooter } from './SiteFooter';

interface ForgedPageProps {
  wheels: WheelDesign[];
  finishes: Record<string, WheelFinish>;
  region: Region;
  onBack: () => void;
  onOpenRim: (wheelId: string) => void;
  onConfigure: (wheel: WheelDesign) => void;
}

const PILLARS = [
  { title: 'Forged, not cast', body: 'Every wheel starts as a single billet of aerospace-grade alloy, pressed under thousands of tonnes before it is machined.' },
  { title: 'Engineered for BMW M', body: 'Load ratings, offsets and centre bores are specified for M cars, with clearance for M Compound and carbon ceramic brakes.' },
  { title: 'Finished by hand', body: 'Each finish is applied and inspected by hand, then sealed to survive track days and winter roads alike.' }
];

/** The collection: every design, its sizes and a way into the 360° view or the configurator. */
export const ForgedPage: React.FC<ForgedPageProps> = ({ wheels, finishes, region, onBack, onOpenRim, onConfigure }) => (
  <div className="absolute inset-0 overflow-y-auto bg-carbon text-ink">
    <header className="sticky top-0 z-20 flex h-16 sm:h-20 items-center justify-between bg-carbon/85 backdrop-blur-xl px-4 sm:px-8 border-b border-line">
      <Button variant="ghost" size="sm" onClick={onBack} className="pl-2">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} /> Back
      </Button>
      <div className="absolute left-1/2 -translate-x-1/2">
        <Logo size="sm" />
      </div>
      <span className="w-20" />
    </header>

    <section className="bg-studio">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-20 grid gap-10 md:grid-cols-[1.1fr_1fr] items-center">
        <div>
          <Eyebrow className="text-bronze animate-rise">{BRAND.descriptor}</Eyebrow>
          <h1 className="mt-4 font-display text-[40px] sm:text-[64px] font-extrabold leading-[0.98] tracking-[-0.04em] animate-rise delay-100">
            The collection
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-mute animate-rise delay-200">
            {wheels.length} forged designs, each offered in {rimSizes(wheels[0] ?? ({} as WheelDesign)).join(', ') || 'several sizes'} and a choice of hand-applied finishes.
          </p>
        </div>
        <div className="flex justify-center animate-rise delay-300">
          {wheels[0]?.imageUrl ? (
            <RimThumb wheel={wheels[0]} finish={finishes[wheels[0].defaultVariant]} size={340} className="max-w-full" />
          ) : wheels[0] && (
            <RimFaceSvg
              wheel={wheels[0]}
              finishHex={finishes[wheels[0].defaultVariant]?.hex}
              size={340}
              withTyre
              className="drop-shadow-[0_40px_50px_rgba(0,0,0,0.6)] max-w-full h-auto"
            />
          )}
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {wheels.map((w, i) => {
          const finish = finishes[w.defaultVariant];
          return (
            <li
              key={w.id}
              className="group flex flex-col rounded-[26px] ring-1 ring-line p-6 transition-all duration-500 ease-lux hover:shadow-panel hover:-translate-y-0.5 animate-rise"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex justify-center rounded-[20px] bg-gradient-to-b from-[#202020] to-[#161616] py-8">
                {w.imageUrl ? (
                  <RimThumb wheel={w} finish={finish} size={176} />
                ) : (
                  <RimFaceSvg wheel={w} finishHex={finish?.hex} size={176} withTyre className="transition-transform duration-700 ease-lux group-hover:rotate-[24deg]" />
                )}
              </div>
              <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze">{w.code}</div>
              <div className="mt-1 text-[17px] font-bold">{w.name}</div>
              <div className="mt-0.5 text-[12.5px] text-mute">{w.style}</div>
              <div className="mt-3 text-[12.5px] text-mute">
                From <span className="font-semibold text-ink">{formatMoney(rimFromPrice(w), region)}</span> per set
              </div>
              <div className="mt-5 flex gap-2 pt-1">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => onOpenRim(w.id)} icon={<Rotate3d className="h-3.5 w-3.5" strokeWidth={1.8} />}>
                  360°
                </Button>
                <Button size="sm" className="flex-1" onClick={() => onConfigure(w)} icon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Configure
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>

    <section className="bg-surface text-white border-t border-line">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24 grid gap-10 md:grid-cols-3">
        {PILLARS.map((p, i) => (
          <div key={p.title}>
            <div className="font-mono text-[11px] text-white/40">0{i + 1}</div>
            <div className="mt-3 font-display text-[20px] font-extrabold tracking-[-0.01em]">{p.title}</div>
            <p className="mt-3 text-[14px] leading-relaxed text-white/60">{p.body}</p>
          </div>
        ))}
      </div>
    </section>

    <SiteFooter />
  </div>
);
