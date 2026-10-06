/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Car, Rotate3d } from 'lucide-react';
import { CarConfiguratorEngine } from '../services/CarConfiguratorEngine';
import { WheelDesign, WheelFinish } from '../types';
import { nearestRimSize, rimPrice, rimSizes } from '../services/pricing';
import { Region, formatMoney } from '../config/brand';
import { Button, Eyebrow, FinishChip, IconButton, cx } from './journey/ui';
import RimSpinView, { loadRimSpinManifest } from './RimSpinView';

interface RimDetailPageProps {
  wheels: WheelDesign[];
  finishes: Record<string, WheelFinish>;
  wheelId: string;
  /** The live catalogue is still loading: a wheel missing from the bundled one may yet arrive. */
  loading?: boolean;
  initialFinishId?: string;
  initialSize?: string;
  region: Region;
  /** The Back button's label (where it returns to). */
  backLabel?: string;
  onBack: () => void;
  onOpenRim: (wheelId: string) => void;
  /** Puts this rim, finish and size on the car in the studio. */
  onConfigure: (wheel: WheelDesign, finish: WheelFinish, size: string) => void;
}

export const RimDetailPage: React.FC<RimDetailPageProps> = ({
  wheels,
  finishes,
  wheelId,
  loading = false,
  initialFinishId,
  initialSize,
  region,
  backLabel = 'Back to your build',
  onBack,
  onOpenRim,
  onConfigure
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CarConfiguratorEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);

  // an unknown id is "not found", not the first wheel under the wrong address
  const found = wheels.findIndex((w) => w.id === wheelId);
  const index = Math.max(0, found);
  const wheel = found >= 0 ? wheels[found] : undefined;
  const availableFinishes = wheel ? wheel.availableVariants.map((id) => finishes[id]).filter(Boolean) : [];
  const defaultFinish =
    availableFinishes.find((f) => f.id === initialFinishId) ??
    finishes[wheel?.defaultVariant ?? ''] ??
    availableFinishes[0];
  const [finish, setFinish] = useState<WheelFinish | undefined>(defaultFinish);
  const [size, setSize] = useState<string>(() => (wheel ? nearestRimSize(wheel, initialSize ?? '20"') : '20"'));

  // Rims with a rendered 360° spin (scripts/rim3d/turntable.py) show that instead of the live engine
  const [spins, setSpins] = useState<Record<string, { frames: number; finishes: string[] }> | null>(null);
  useEffect(() => {
    loadRimSpinManifest().then(setSpins);
  }, []);
  const [failedSpins, setFailedSpins] = useState<Set<string>>(() => new Set());
  const spinKey = wheel && finish ? `${wheel.id}/${finish.id}` : '';
  const spin = wheel && finish && !failedSpins.has(spinKey) && spins?.[wheel.id]?.finishes.includes(finish.id) ? spins[wheel.id] : null;
  const onSpinError = useCallback(() => setFailedSpins((s) => (s.has(spinKey) ? s : new Set(s).add(spinKey))), [spinKey]);
  const liveEngine = spins !== null && !spin;

  // One showcase engine for the page's lifetime. Waits for the wheel: on a direct link to a wheel
  // that only exists in Supabase, the first render is "not found" and has no container yet.
  const hasWheel = !!wheel;
  useEffect(() => {
    if (!hasWheel || !liveEngine || !containerRef.current) return;
    const engine = new CarConfiguratorEngine(containerRef.current, () => setReady(true), { showcase: true });
    engineRef.current = engine;
    engine.setAutoRotate(true);
    const onResize = () => engine.handleResize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.cleanup();
      engineRef.current = null;
    };
  }, [hasWheel, liveEngine]);

  // Switching rims keeps the finish/size when the new rim offers them
  useEffect(() => {
    if (!wheel) return;
    setFinish((f) => (f && wheel.availableVariants.includes(f.id) ? f : finishes[wheel.defaultVariant] ?? availableFinishes[0]));
    setSize((s) => nearestRimSize(wheel, s));
  }, [wheel?.id]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !wheel) return;
    engine.applyWheelDesign(wheel);
    if (finish) engine.applyWheelFinish(finish);
    engine.setRimSize(size);
    // liveEngine: the engine is made when a spin fails, after the wheel was chosen
  }, [wheel, finish, size, liveEngine]);

  if (!wheel) {
    if (loading) return <div className="absolute inset-0 bg-studio" />;
    return (
      <div className="absolute inset-0 bg-studio flex items-center justify-center gap-4 text-mute text-sm">
        Wheel not found.
        <Button variant="secondary" size="sm" onClick={onBack}>Back</Button>
      </div>
    );
  }

  const prev = wheels[(index - 1 + wheels.length) % wheels.length];
  const next = wheels[(index + 1) % wheels.length];
  const money = (usd: number) => formatMoney(usd, region);

  return (
    <div className="absolute inset-0 overflow-hidden bg-studio text-ink flex flex-col lg:flex-row short:flex-row select-none">
      {/* 360° turntable */}
      {/* at least 320 px: on a 568 px-tall phone 46% left the wheel ~150 px wide once the overlaid controls are cleared */}
      <div className="relative h-[max(46dvh,320px)] shrink-0 lg:h-auto lg:flex-1 lg:min-h-0 short:h-auto short:flex-1 short:min-h-0">
        {spin ? (
          // the padding keeps the wheel clear of the overlaid controls: the back button over its top on a
          // phone (and on a phone on its side, where the column is narrow), and the rotate pill + hint
          // (88 px, 100 px on sm+) over its bottom
          <div className="absolute inset-0 px-4 pt-14 pb-[88px] sm:p-8 sm:pb-[100px] short:pt-16">
            <RimSpinView wheelId={wheel.id} finishId={finish!.id} frames={spin.frames} autoRotate={autoRotate} onError={onSpinError} />
          </div>
        ) : (
          <div ref={containerRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
        )}
        {!ready && !spin && spins !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-studio">
            <div className="h-10 w-10 rounded-full border border-ink/15 border-t-ink animate-spin" />
          </div>
        )}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
          <Button variant="light" size="sm" onClick={onBack} className="pl-3">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} /> {backLabel}
          </Button>
        </div>
        <div className="absolute top-5 sm:top-7 left-1/2 -translate-x-1/2 hidden xl:block">
          <Eyebrow className="tracking-[0.34em]">360° view</Eyebrow>
        </div>
        <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1 rounded-full bg-surface/85 backdrop-blur p-1 ring-1 ring-line shadow-float">
            <IconButton label={`Previous: ${prev.name}`} onClick={() => onOpenRim(prev.id)}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <button
              onClick={() => { const v = !autoRotate; setAutoRotate(v); engineRef.current?.setAutoRotate(v); }}
              className={cx('flex h-10 items-center gap-2 rounded-full px-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] transition', autoRotate ? 'bg-gold text-carbon' : 'text-ink hover:bg-ink/[0.05]')}
            >
              <Rotate3d className="h-4 w-4" strokeWidth={1.7} /> Rotate
            </button>
            <IconButton label={`Next: ${next.name}`} onClick={() => onOpenRim(next.id)}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
          <p className="text-[11px] text-mute whitespace-nowrap">{spin ? 'Drag to rotate' : 'Drag to rotate · Scroll to zoom'}</p>
        </div>
      </div>

      {/* Details */}
      <aside className="w-full min-h-0 flex-1 lg:flex-none lg:w-[var(--panel-w)] short:flex-none short:w-[min(360px,46vw)] shrink-0 bg-surface lg:border-l short:border-l border-line overflow-y-auto overscroll-contain px-6 sm:px-7 py-7 space-y-7 shadow-panel">
        <div key={wheel.id} className="animate-rise">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-bronze">{wheel.code}</div>
          <h1 className="mt-2 font-display text-[26px] font-extrabold tracking-[-0.02em]">{wheel.name}</h1>
          <p className="mt-1 text-[13px] text-mute">{wheel.subtitle}</p>
        </div>

        <div>
          <Eyebrow className="mb-3">Finish · <span className="text-ink">{finish?.name}</span></Eyebrow>
          <div className="flex flex-wrap gap-2.5">
            {availableFinishes.map((f) => (
              <button
                key={f.id}
                onClick={() => setFinish(f)}
                title={f.name}
                className={cx('rounded-full p-[3px] transition-all duration-300', finish?.id === f.id ? 'ring-[1.5px] ring-ink' : 'ring-1 ring-transparent hover:ring-line')}
              >
                <FinishChip finish={f} size={40} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <Eyebrow className="mb-3">Size</Eyebrow>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {rimSizes(wheel).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={cx('rounded-xl py-2.5 px-2 ring-1 transition-all duration-300 text-center min-h-12 flex items-center justify-center', size === s ? 'bg-gold text-carbon ring-gold' : 'ring-line hover:ring-ink/30')}
              >
                <span className="block font-display text-[15px] font-extrabold">{s}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end justify-between border-y border-line py-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">Set of four</div>
            <div className="mt-1 font-display text-[26px] font-extrabold tabular-nums">{money(rimPrice(wheel, size))}</div>
          </div>
          {(wheel.weightFrontKg > 0 || wheel.weightRearKg > 0) && (
            <div className="text-right text-[12px] text-mute">
              {wheel.weightFrontKg} kg front<br />{wheel.weightRearKg} kg rear
            </div>
          )}
        </div>

        <Button size="lg" className="w-full" onClick={() => finish && onConfigure(wheel, finish, size)} icon={<Car className="h-4 w-4" strokeWidth={1.7} />}>
          See it on my car
        </Button>

        {wheel.description && <p className="text-[14px] leading-relaxed text-mute">{wheel.description}</p>}
        {wheel.highlights.length > 0 && (
          <ul className="space-y-2.5">
            {wheel.highlights.map((h) => (
              <li key={h} className="flex gap-3 text-[13px]">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-bronze" /> {h}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
};
