/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo } from 'react';
import { ArrowRight, ChevronDown, Globe } from 'lucide-react';
import { BRAND, Region } from '../../config/brand';
import { Button, Logo } from './ui';
import { SocialLinks } from './SocialLinks';
import { HERO_SLIDES, HeroControls, HeroStage, useHeroCycle } from './HeroStage';

/** Region select + Enter over the studio stage: Cycles stills of the prepared cars, cycled by arrows, scroll,
 *  keyboard or swipe. Enter opens the configurator on the car that is on stage. */
export const WelcomeGate: React.FC<{
  region: Region;
  onRegionChange: (region: Region) => void;
  /** Enter: the car on stage and the paint its still shows. */
  onEnter: (carId: string, paintId: string) => void;
  onOpenForged: () => void;
  /** The car to open the carousel on (the one being built, when the visitor comes back to change it). */
  startCarId?: string;
  /** A car came on stage: the app gets its model ready, so Enter does not wait for it. */
  onSlide?: (carId: string) => void;
  /**
   * The cars on offer (the catalogue's active cars). The carousel is the only place a car is chosen, so a car
   * hidden in /admin must not be offered here: its slide is left out. All slides show while this is unknown.
   */
  carIds?: readonly string[];
}> = ({ region, onRegionChange, onEnter, onOpenForged, startCarId, onSlide, carIds }) => {
  const slides = useMemo(() => {
    const offered = carIds ? HERO_SLIDES.filter((s) => carIds.includes(s.carId)) : HERO_SLIDES;
    return offered.length ? offered : HERO_SLIDES; // never an empty stage
  }, [carIds]);
  const hero = useHeroCycle(slides.length, slides.findIndex((s) => s.carId === startCarId));
  // The list can shrink while the welcome is open (the live catalogue arrives after the bundled one)
  const index = Math.min(hero.index, slides.length - 1);
  const stageCarId = slides[index].carId;
  useEffect(() => {
    onSlide?.(stageCarId);
    // (the callback's identity changes with every app render; only a new car on stage should report)
  }, [stageCarId]);
  return (
    <div className="stage-dark absolute inset-0 z-30 pointer-events-none">
      <HeroStage slides={slides} index={index} prev={hero.prev} dir={hero.dir} />

      {/* Legibility wash behind the text only; the car stays crisp */}
      <div className="absolute inset-y-0 left-0 hidden landscape:block w-[38%] bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-black via-black/85 to-transparent landscape:hidden" />

      <header className="absolute top-0 inset-x-0 flex items-center justify-between px-6 sm:px-12 pt-6 sm:pt-9 short:pt-4 animate-fade">
        <Logo />
        <button
          onClick={onOpenForged}
          className="pointer-events-auto flex h-10 items-center px-3 -mr-3 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-mute hover:text-ink transition-colors"
        >
          The wheels
        </button>
      </header>

      <HeroControls slides={slides} index={index} onStep={hero.step} onJump={hero.jump} />

      <div className="absolute left-0 bottom-0 w-full sm:max-w-xl landscape:max-w-lg px-6 sm:px-12 pb-10 sm:pb-16 short:pb-4 pointer-events-auto">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.34em] text-bronze animate-rise">{BRAND.descriptor}</div>
        <h1 className="mt-4 short:mt-2 font-display text-[34px] leading-[1.02] sm:text-[52px] short:text-[30px] font-extrabold tracking-[-0.03em] text-ink animate-rise delay-100">
          {BRAND.welcomeTitle}
        </h1>
        <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-mute animate-rise delay-200 hidden lg:block short:hidden">{BRAND.welcomeBody}</p>

        <div className="mt-8 short:mt-3 flex flex-col sm:flex-row short:flex-row gap-3 animate-rise delay-300">
          <label className="relative flex h-14 short:h-11 w-full sm:flex-1 shrink-0 items-center rounded-full bg-surface ring-1 ring-line pl-5 pr-11 hover:ring-ink/25 transition">
            <Globe className="h-4 w-4 text-mute shrink-0" strokeWidth={1.6} />
            <span className="sr-only">Region</span>
            <select
              value={region.id}
              onChange={(e) => onRegionChange(BRAND.regions.find((r) => r.id === e.target.value) ?? region)}
              className="absolute inset-0 w-full cursor-pointer appearance-none rounded-full bg-transparent pl-12 pr-11 text-[13px] font-medium text-ink outline-none"
            >
              {BRAND.regions.map((r) => (
                <option key={r.id} value={r.id} className="bg-surface text-ink">
                  {r.label} · {r.language} · {r.currency}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-5 h-4 w-4 text-mute" />
          </label>
          <Button
            size="lg"
            onClick={() => onEnter(stageCarId, slides[index].paintId)}
            icon={<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
          >
            Enter
          </Button>
        </div>
        <SocialLinks size="sm" className="mt-7 short:mt-3 animate-rise delay-500" />
      </div>
    </div>
  );
};
