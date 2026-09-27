/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowRight, ChevronDown, Globe } from 'lucide-react';
import { BRAND, Region } from '../../config/brand';
import { Button, Logo } from './ui';
import { SocialLinks } from './SocialLinks';

/** Region select + Enter, over the live car turning slowly in the studio. */
export const WelcomeGate: React.FC<{
  region: Region;
  onRegionChange: (region: Region) => void;
  onEnter: () => void;
  onOpenForged: () => void;
}> = ({ region, onRegionChange, onEnter, onOpenForged }) => (
  <div className="absolute inset-0 z-30 pointer-events-none">
    {/* Legibility wash on the text side only; the car stays crisp */}
    <div className="absolute inset-y-0 left-0 hidden sm:block w-[44%] bg-gradient-to-r from-carbon/80 via-carbon/40 to-transparent" />
    <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-carbon via-carbon/80 to-transparent sm:hidden" />

    <header className="absolute top-0 inset-x-0 flex items-center justify-between px-6 sm:px-12 pt-6 sm:pt-9 animate-fade">
      <Logo />
      <button
        onClick={onOpenForged}
        className="pointer-events-auto text-[10.5px] font-semibold uppercase tracking-[0.24em] text-mute hover:text-ink transition-colors"
      >
        The wheels
      </button>
    </header>

    <div className="absolute left-0 bottom-0 w-full sm:max-w-xl px-6 sm:px-12 pb-10 sm:pb-16 pointer-events-auto">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.34em] text-bronze animate-rise">{BRAND.descriptor}</div>
      <h1 className="mt-4 font-display text-[34px] leading-[1.02] sm:text-[56px] font-extrabold tracking-[-0.03em] text-ink animate-rise delay-100">
        {BRAND.welcomeTitle}
      </h1>
      <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-mute animate-rise delay-200">{BRAND.welcomeBody}</p>

      <div className="mt-8 flex flex-col sm:flex-row gap-3 animate-rise delay-300">
        <label className="relative flex h-14 w-full sm:flex-1 shrink-0 items-center rounded-full bg-surface ring-1 ring-line pl-5 pr-11 hover:ring-ink/25 transition">
          <Globe className="h-4 w-4 text-mute shrink-0" strokeWidth={1.6} />
          <span className="sr-only">Region</span>
          <select
            value={region.id}
            onChange={(e) => onRegionChange(BRAND.regions.find((r) => r.id === e.target.value) ?? region)}
            className="absolute inset-0 w-full cursor-pointer appearance-none rounded-full bg-transparent pl-12 pr-11 text-[13px] font-medium text-ink outline-none"
          >
            {BRAND.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} · {r.language} · {r.currency}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-5 h-4 w-4 text-mute" />
        </label>
        <Button size="lg" onClick={onEnter} icon={<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}>
          Enter
        </Button>
      </div>
      <SocialLinks size="sm" className="mt-7 animate-rise delay-500" />
    </div>
  </div>
);
