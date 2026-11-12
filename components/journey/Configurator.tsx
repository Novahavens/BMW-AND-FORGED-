/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Info,
  MoreHorizontal,
  Pause,
  Play,
  Rotate3d
} from 'lucide-react';
import { BRAND, Region, formatMoney } from '../../config/brand';
import { CameraViewPreset, CarModel, PaintColor, WheelDesign, WheelFinish } from '../../types';
import { finishSurcharge, rimFromPrice, rimPrice, rimSizes } from '../../services/pricing';
import { PAINT_FAMILIES, PaintFamily, paintFamily } from '../../services/journeyService';
import { Button, Eyebrow, FinishChip, IconButton, Modal, PaintChip, RimThumb, cx, wheelEyebrow } from './ui';
import { RimFaceSvg } from './RimFaceSvg';
import { shortModelName } from './carNames';
import { ViewerPanel } from './ViewerPanel';

export type ConfigStep = 'overview' | 'paint' | 'wheels' | 'size' | 'finish';
const STEPS: { id: Exclude<ConfigStep, 'overview'>; label: string }[] = [
  { id: 'paint', label: 'Paint' },
  { id: 'wheels', label: 'Wheels' },
  { id: 'size', label: 'Size' },
  { id: 'finish', label: 'Finish' }
];

const VIEWS: { id: CameraViewPreset; label: string }[] = [
  { id: 'frontThreeQuarter', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'rearThreeQuarter', label: 'Rear' },
  { id: 'frontWheel', label: 'Wheel' },
  { id: 'top', label: 'Top' }
];

export interface ConfiguratorProps {
  car: CarModel;
  /** Every car the visitor may switch to from the panel (the viewer's Car chips); omitted = no chips. */
  cars?: CarModel[];
  onSelectCar?: (car: CarModel) => void;
  paints: PaintColor[];
  wheels: WheelDesign[];
  finishes: Record<string, WheelFinish>;
  paint: PaintColor;
  wheel: WheelDesign;
  finish: WheelFinish;
  size: string;
  region: Region;
  step: ConfigStep;
  onStep: (step: ConfigStep) => void;
  cameraView: CameraViewPreset;
  autoRotate: boolean;
  onCamera: (view: CameraViewPreset) => void;
  /** Absent for a frames-only car (its body is fixed images: no turntable). */
  onToggleRotate?: () => void;
  onPaint: (paint: PaintColor) => void;
  onWheel: (wheel: WheelDesign) => void;
  onSize: (size: string) => void;
  onFinish: (finish: WheelFinish) => void;
  onChangeModel: () => void;
  onSummary: () => void;
  onOpen360: (wheel: WheelDesign) => void;
  onOpenMore: () => void;
}

/**
 * The configurator screen. The controls are the stepped drawer (StepDrawer below: Overview, Paint, Wheels, Size,
 * Finish; a bottom sheet on phones, a side panel on wider screens), which the owner chose over the vehicle spec
 * viewer's glass panel (Nov 2026). ViewerPanel is kept behind the `?panel=viewer` comparison switch only.
 */
export const Configurator: React.FC<ConfiguratorProps> = (p) => {
  const [infoWheel, setInfoWheel] = useState<WheelDesign | null>(null);
  const viewerPanel = typeof window !== 'undefined' && /[?&]panel=viewer/.test(window.location.search);
  if (!viewerPanel) return <StepDrawer {...p} />;
  const infoFinish = sheetFinish(infoWheel, p.wheel, p.finish);
  return (
    <>
      <ViewerPanel {...p} onInfo={setInfoWheel} />
      <WheelInfoModal
        wheel={infoWheel}
        region={p.region}
        finishes={p.finishes}
        finishId={infoFinish?.id}
        finishName={infoFinish?.name}
        onClose={() => setInfoWheel(null)}
        onOpen360={p.onOpen360}
      />
    </>
  );
};

/**
 * The finish the wheel detail sheet prices its sizes in: the selected finish, so the sheet agrees with the
 * panel's price. A sheet opened for another wheel only takes that finish when the wheel offers it.
 */
const sheetFinish = (wheel: WheelDesign | null, selected: WheelDesign, finish: WheelFinish): WheelFinish | undefined =>
  wheel && (wheel.id === selected.id || wheel.availableVariants.includes(finish.id)) ? finish : undefined;

const StepDrawer: React.FC<ConfiguratorProps> = (p) => {
  const [infoWheel, setInfoWheel] = useState<WheelDesign | null>(null);
  const infoFinish = sheetFinish(infoWheel, p.wheel, p.finish);
  const price = rimPrice(p.wheel, p.size, p.finish.id);
  const stepIndex = STEPS.findIndex((s) => s.id === p.step);

  return (
    <>
      {/* Top-left: back to the welcome carousel, where the cars are chosen */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-30 animate-fade">
        <Button variant="light" size="sm" onClick={p.onChangeModel} icon={null} className="pl-3">
          <ChevronLeft className="h-4 w-4 -ml-0.5" strokeWidth={1.8} />
          Change model
        </Button>
      </div>

      {/* Camera controls, centred under the car */}
      {/* Centred in the part of the screen the controls leave (panel mode), or just above the sheet */}
      <div className="absolute z-30 left-[calc((100%-var(--panel-w))/2)] -translate-x-1/2 bottom-8 short:bottom-3 sheet:left-1/2 sheet:bottom-[calc(var(--sheet-h)+14px)] animate-rise delay-300">
        <div className="flex items-center gap-0.5 rounded-full bg-surface/85 backdrop-blur-md p-1 ring-1 ring-line shadow-float max-w-[calc(100vw-var(--panel-w)-24px)] sheet:max-w-[calc(100vw-24px)] overflow-x-auto no-scrollbar">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => p.onCamera(v.id)}
              className={cx(
                'h-10 min-w-10 shrink-0 rounded-full px-3 tracking-[0.1em] [@media(max-width:374px)]:px-2 [@media(max-width:374px)]:tracking-[0.04em] sm:px-4 text-[10px] sm:text-[10.5px] font-semibold uppercase sm:tracking-[0.14em] transition-all duration-300 ease-lux',
                p.cameraView === v.id ? 'bg-gold text-carbon' : 'text-mute hover:text-ink'
              )}
            >
              {v.label}
            </button>
          ))}
          {p.onToggleRotate && (
            <>
              <span className="mx-0.5 sm:mx-1 h-5 w-px bg-line" />
              <IconButton label={p.autoRotate ? 'Stop turntable' : 'Turntable'} onClick={p.onToggleRotate} active={p.autoRotate} className="h-10 w-10 shrink-0">
                {p.autoRotate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-px" />}
              </IconButton>
            </>
          )}
        </div>
      </div>

      {/* Panel: right column on desktop, bottom sheet on phones */}
      <aside
        className="absolute z-40 bg-surface/[0.97] backdrop-blur-xl shadow-panel flex flex-col animate-slide-in
          right-0 top-0 bottom-0 w-[var(--panel-w)] border-l border-line
          sheet:inset-x-0 sheet:top-auto sheet:w-auto sheet:h-[var(--sheet-h)] sheet:rounded-t-[26px] sheet:border-l-0"
      >
        <div className="hidden sheet:block mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-ink/15" />
        <div className="flex items-start justify-between gap-3 px-7 pt-7 short:pt-3 sheet:px-6 sheet:pt-3">
          <div className="min-w-0">
            <Eyebrow>Your build</Eyebrow>
            <div className="mt-1.5 short:mt-0.5 truncate font-display text-[19px] short:text-[16px] font-extrabold tracking-[-0.01em]">{p.car.name}</div>
          </div>
          <div className="flex items-center -mr-2">
            <IconButton label="More options" onClick={p.onOpenMore}>
              <MoreHorizontal className="h-5 w-5" strokeWidth={1.6} />
            </IconButton>
            <IconButton label="Summary" onClick={p.onSummary}>
              <ClipboardList className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </IconButton>
          </div>
        </div>

        {/* Stepper */}
        <nav className="mt-6 short:mt-1 sheet:mt-2 px-7 sheet:px-6">
          <div className="flex items-center justify-between">
            <button onClick={() => p.onStep('overview')} className="flex h-10 items-center font-display text-[13px] font-bold uppercase tracking-[0.12em]">
              Exterior
            </button>
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => p.onStep(s.id)}
                  aria-label={`Step ${i + 1}: ${s.label}`}
                  className="group flex h-10 w-10 items-center justify-center"
                >
                  {/* 40 px to tap, 28 px to look at */}
                  <span
                    className={cx(
                      'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-all duration-300 ease-lux',
                      i === stepIndex ? 'bg-gold text-carbon' : i < stepIndex ? 'text-ink' : 'text-mute group-hover:text-ink'
                    )}
                  >
                    {i + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 h-px bg-line relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-bronze transition-all duration-500 ease-lux"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </nav>

        <div key={p.step} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pt-5 pb-6 short:pt-3 short:pb-3 sheet:px-6">
          <div className="animate-step">
            {p.step === 'overview' && <Overview {...p} />}
            {p.step === 'paint' && <PaintStep {...p} />}
            {p.step === 'wheels' && <WheelStep {...p} onInfo={setInfoWheel} />}
            {p.step === 'size' && <SizeStep {...p} />}
            {p.step === 'finish' && <FinishStep {...p} />}
          </div>
        </div>

        {/* Sticky total + primary action */}
        <div className="shrink-0 border-t border-line px-7 py-5 short:py-2 sheet:px-6 sheet:py-3 bg-surface sheet:flex sheet:items-center sheet:gap-4">
          <div className="flex items-end justify-between gap-3 sheet:flex-col sheet:items-start sheet:gap-0 sheet:shrink-0">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">Wheel set of four</div>
              <div className="mt-1 truncate text-[12px] text-mute short:hidden sheet:hidden">
                {p.wheel.name} · {p.size} · {p.finish.name}
              </div>
            </div>
            <div className="shrink-0 font-display text-[20px] short:text-[17px] font-extrabold tabular-nums">{formatMoney(price, p.region)}</div>
          </div>
          {/* On a narrow phone the price leaves ~130-170 px: less padding and no arrow keep the label to one or two lines */}
          <Button className="mt-4 short:mt-2 sheet:mt-0 w-full sheet:flex-1 short:h-11 sheet:h-12 sheet:px-4" size="lg" onClick={p.onSummary} icon={<ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1 [@media(max-width:374px)]:hidden" />}>
            View your {shortModelName(p.car)}
          </Button>
        </div>
      </aside>

      <WheelInfoModal
        wheel={infoWheel}
        region={p.region}
        finishes={p.finishes}
        finishId={infoFinish?.id}
        finishName={infoFinish?.name}
        onClose={() => setInfoWheel(null)}
        onOpen360={p.onOpen360}
      />
    </>
  );
};

// ----------------------------------------------------
// Steps
// ----------------------------------------------------

const StepHeader: React.FC<{ title: string; onBack: () => void; hint?: string }> = ({ title, onBack, hint }) => (
  <div className="mb-5">
    <button onClick={onBack} className="-ml-1 -my-3 inline-flex h-10 items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-mute hover:text-ink transition">
      <ChevronLeft className="h-3.5 w-3.5" /> Exterior
    </button>
    <h3 className="mt-2 font-display text-[22px] font-extrabold tracking-[-0.015em]">{title}</h3>
    {hint && <p className="mt-1 text-[12.5px] leading-relaxed text-mute">{hint}</p>}
  </div>
);

const NextLink: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    onClick={onClick}
    className="group mt-7 flex w-full items-center justify-between rounded-2xl bg-ink/[0.035] px-5 py-4 text-left hover:bg-ink/[0.06] transition"
  >
    <span>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">Next</span>
      <span className="mt-0.5 block text-[14px] font-semibold">{label}</span>
    </span>
    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
  </button>
);

const Overview: React.FC<ConfiguratorProps> = (p) => {
  const rows: { step: ConfigStep; label: string; value: string; detail?: string; visual: React.ReactNode }[] = [
    { step: 'paint', label: 'Paint', value: p.paint.name, detail: `${p.paint.type} · ${p.paint.code}`, visual: <PaintChip paint={p.paint} size={36} /> },
    {
      step: 'wheels',
      label: 'Wheels',
      value: p.wheel.name,
      detail: p.wheel.style,
      visual: <RimThumb wheel={p.wheel} finish={p.finish} size={40} />
    },
    {
      step: 'size',
      label: 'Wheel size',
      value: p.size,
      detail: formatMoney(rimPrice(p.wheel, p.size, p.finish.id), p.region),
      visual: <span className="font-display text-[13px] font-extrabold">{p.size}</span>
    },
    { step: 'finish', label: 'Wheel finish', value: p.finish.name, detail: p.finish.colorName, visual: <FinishChip finish={p.finish} size={36} /> }
  ];
  return (
    <div>
      <p className="text-[12.5px] leading-relaxed text-mute">Choose the paint, then design, size and finish of your forged wheels. The car updates as you go.</p>
      <ul className="mt-4">
        {rows.map((r, i) => (
          <li key={r.step} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <button onClick={() => p.onStep(r.step)} className="group flex w-full items-center gap-4 border-b border-line py-4 text-left">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center">{r.visual}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">{r.label}</span>
                <span className="mt-0.5 block truncate text-[14px] font-semibold text-ink">{r.value}</span>
                {r.detail && <span className="block truncate text-[12px] text-mute">{r.detail}</span>}
              </span>
              <ChevronRight className="h-4 w-4 text-mute transition group-hover:translate-x-0.5 group-hover:text-ink" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const PaintStep: React.FC<ConfiguratorProps> = (p) => {
  const groups = useMemo(() => {
    const map = new Map<PaintFamily, PaintColor[]>();
    p.paints.forEach((paint) => {
      const f = paintFamily(paint);
      map.set(f, [...(map.get(f) ?? []), paint]);
    });
    return PAINT_FAMILIES.filter((f) => map.has(f)).map((f) => ({ family: f, paints: map.get(f)! }));
  }, [p.paints]);

  return (
    <div>
      <StepHeader title="Paint" onBack={() => p.onStep('overview')} hint={`${p.paint.name} · ${p.paint.type} · ${p.paint.code}`} />
      {groups.map((g) => (
        <section key={g.family} className="mb-6">
          <Eyebrow className="mb-3">{g.family}</Eyebrow>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-4">
            {g.paints.map((paint) => {
              const active = paint.id === p.paint.id;
              return (
                <button key={paint.id} onClick={() => p.onPaint(paint)} className="group flex flex-col items-center text-center" title={paint.name}>
                  <span
                    className={cx(
                      'rounded-full p-[3px] transition-all duration-300 ease-lux',
                      active ? 'ring-[1.5px] ring-ink' : 'ring-1 ring-transparent group-hover:ring-line'
                    )}
                  >
                    <PaintChip paint={paint} size={46} />
                  </span>
                  <span className={cx('mt-2 text-[11px] leading-tight', active ? 'text-ink font-semibold' : 'text-mute')}>{paint.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <NextLink label="Wheels" onClick={() => p.onStep('wheels')} />
    </div>
  );
};

const WheelStep: React.FC<ConfiguratorProps & { onInfo: (w: WheelDesign) => void }> = (p) => (
  <div>
    <StepHeader title="Wheels" onBack={() => p.onStep('overview')} />

    {/* Hero */}
    <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-b from-[#202020] to-[#161616] ring-1 ring-line">
      <div className="flex items-center justify-center pt-7 pb-3">
        <div key={p.wheel.id + p.finish.id} className="animate-rise">
          {p.wheel.imageUrl ? (
            <RimThumb wheel={p.wheel} finish={p.finish} size={190} />
          ) : (
            <RimFaceSvg wheel={p.wheel} finishHex={p.finish.hex} size={190} withTyre className="drop-shadow-[0_18px_22px_rgba(0,0,0,0.25)]" />
          )}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 px-5 pb-5">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bronze">{wheelEyebrow(p.wheel)}</div>
          <div className="mt-1 truncate text-[16px] font-bold">{p.wheel.name}</div>
          <div className="truncate text-[12px] text-mute">
            {p.size} · {p.finish.name}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <IconButton label="Wheel details" onClick={() => p.onInfo(p.wheel)} className="bg-surface ring-1 ring-line">
            <Info className="h-4 w-4" strokeWidth={1.7} />
          </IconButton>
          <IconButton label="View in 360°" onClick={() => p.onOpen360(p.wheel)} className="bg-surface ring-1 ring-line">
            <Rotate3d className="h-4 w-4" strokeWidth={1.7} />
          </IconButton>
        </div>
      </div>
    </div>

    <ul className="mt-5">
      {p.wheels.map((w) => (
        <WheelRow key={w.id} wheel={w} active={w.id === p.wheel.id} finish={p.finishes[w.defaultVariant] ?? p.finish} region={p.region} onWheel={p.onWheel} />
      ))}
    </ul>
    <NextLink label="Wheel size" onClick={() => p.onStep('size')} />
  </div>
);

/** One wheel in the list; memoised, so a pick re-renders only the two rows whose tick changes. */
const WheelRow = React.memo<{ wheel: WheelDesign; active: boolean; finish: WheelFinish; region: Region; onWheel: (wheel: WheelDesign) => void }>(
  ({ wheel: w, active, finish, region, onWheel }) => (
    <li>
      <button
        onClick={() => onWheel(w)}
        className={cx(
          'group flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-all duration-300 ease-lux',
          active ? 'bg-ink/[0.045]' : 'hover:bg-ink/[0.03]'
        )}
      >
        <RimThumb wheel={w} finish={finish} size={54} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">{w.name}</span>
          <span className="block truncate text-[11.5px] text-mute">
            {w.style} · from {formatMoney(rimFromPrice(w), region)}
          </span>
        </span>
        <span className={cx('flex h-6 w-6 items-center justify-center rounded-full transition', active ? 'bg-gold text-carbon' : 'ring-1 ring-line text-transparent')}>
          <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
      </button>
    </li>
  )
);

const SizeStep: React.FC<ConfiguratorProps> = (p) => {
  const sizes = rimSizes(p.wheel);
  const fit = p.car.recommendedWheelFitment;
  // Only the parts we know; cars added without specs show no fitment line at all
  const fitment =
    fit?.front || fit?.rear
      ? [fit.front && `front ${fit.front}`, fit.rear && `rear ${fit.rear}`, fit.pcd].filter(Boolean).join(', ')
      : '';
  return (
    <div>
      <StepHeader
        title="Wheel size"
        onBack={() => p.onStep('overview')}
        hint="A bigger wheel means a slimmer tyre sidewall. Prices are for a set of four."
      />
      <div className="grid grid-cols-2 gap-2.5">
        {sizes.map((s) => {
          const active = s === p.size;
          return (
            <button
              key={s}
              onClick={() => p.onSize(s)}
              className={cx(
                'rounded-2xl px-4 py-4 text-left ring-1 transition-all duration-300 ease-lux',
                active ? 'bg-gold text-carbon ring-gold' : 'bg-surface ring-line hover:ring-ink/30'
              )}
            >
              <div className="font-display text-[24px] font-extrabold tracking-[-0.02em]">{s}</div>
              <div className={cx('mt-1 text-[12px] tabular-nums', active ? 'text-carbon/70' : 'text-mute')}>{formatMoney(rimPrice(p.wheel, s, p.finish.id), p.region)}</div>
            </button>
          );
        })}
      </div>
      {fitment && (
        <div className="mt-5 rounded-2xl bg-ink/[0.035] p-4 text-[12px] leading-relaxed text-mute">
          <span className="font-semibold text-ink">Factory fitment for the {shortModelName(p.car)}:</span> {fitment}.
        </div>
      )}
      <NextLink label="Wheel finish" onClick={() => p.onStep('finish')} />
    </div>
  );
};

const FinishStep: React.FC<ConfiguratorProps> = (p) => {
  const available = p.wheel.availableVariants.map((id) => p.finishes[id]).filter(Boolean);
  return (
    <div>
      <StepHeader title="Wheel finish" onBack={() => p.onStep('overview')} hint={p.finish.description} />
      <ul className="space-y-1.5">
        {available.map((f) => {
          const active = f.id === p.finish.id;
          return (
            <li key={f.id}>
              <button
                onClick={() => p.onFinish(f)}
                className={cx(
                  'flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-all duration-300 ease-lux',
                  active ? 'bg-ink/[0.045]' : 'hover:bg-ink/[0.03]'
                )}
              >
                <FinishChip finish={f} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold">{f.name}</span>
                  <span className="block truncate text-[11.5px] text-mute">{f.colorName}</span>
                </span>
                {f.badge && <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-bronze">{f.badge}</span>}
                <span className={cx('ml-1 flex h-6 w-6 items-center justify-center rounded-full transition', active ? 'bg-gold text-carbon' : 'ring-1 ring-line text-transparent')}>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <NextLink label="Summary" onClick={p.onSummary} />
    </div>
  );
};

// ----------------------------------------------------
// Wheel detail sheet (the ⓘ button)
// ----------------------------------------------------

export const WheelInfoModal: React.FC<{
  wheel: WheelDesign | null;
  region: Region;
  finishes: Record<string, WheelFinish>;
  /** The finish the sizes are priced in (the selected one, so the sheet matches the panel); omitted = base finish. */
  finishId?: string;
  finishName?: string;
  onClose: () => void;
  onOpen360: (wheel: WheelDesign) => void;
}> = ({ wheel, region, finishes, finishId, finishName, onClose, onOpen360 }) => {
  // What the finish adds over the base finish, per size; one figure when it is the same at every size
  const extras = wheel && finishId ? rimSizes(wheel).map((s) => finishSurcharge(wheel, s, finishId)).filter((x) => x > 0) : [];
  const lo = Math.min(...extras);
  const hi = Math.max(...extras);
  const extra = extras.length ? (lo === hi ? formatMoney(hi, region) : `${formatMoney(lo, region)} to ${formatMoney(hi, region)}`) : '';
  const extraFinish = finishName ?? (finishId ? finishes[finishId]?.name : undefined);
  return (
    <Modal open={!!wheel} onClose={onClose} title={wheel ? `${wheel.code}` : ''} width="max-w-xl">
      {wheel && (
        <div>
          <div className="flex items-center gap-5">
            <RimThumb wheel={wheel} finish={finishes[wheel.defaultVariant]} size={110} />
            <div className="min-w-0">
              <div className="font-display text-[20px] font-extrabold tracking-[-0.015em]">{wheel.name}</div>
              <div className="mt-1 text-[13px] text-mute">{wheel.subtitle}</div>
              <div className="mt-2 text-[12px] font-semibold text-bronze">From {formatMoney(rimFromPrice(wheel), region)} per set</div>
            </div>
          </div>
          <p className="mt-6 text-[14px] leading-relaxed text-mute">{wheel.description}</p>
          <ul className="mt-5 space-y-2">
            {wheel.highlights.map((h) => (
              <li key={h} className="flex gap-3 text-[13px] text-ink">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-bronze" />
                {h}
              </li>
            ))}
          </ul>
          {(wheel.weightFrontKg > 0 || wheel.weightRearKg > 0) && (
          <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-line ring-1 ring-line text-center">
            {[
              ['Front', `${wheel.weightFrontKg} kg`],
              ['Rear', `${wheel.weightRearKg} kg`],
              ['Saving', wheel.weightSavingsKg > 0 ? `${wheel.weightSavingsKg} kg` : '—']
            ].map(([k, v]) => (
              <div key={k} className="bg-surface p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">{k}</div>
                <div className="mt-1 font-display text-[16px] font-extrabold">{v}</div>
              </div>
            ))}
          </div>
          )}
          <div className="mt-6">
            <Eyebrow className="mb-2">Sizes and prices (set of four)</Eyebrow>
            <div className="flex flex-wrap gap-2">
              {rimSizes(wheel).map((s) => (
                <span key={s} className="rounded-full bg-ink/[0.04] px-3 py-1.5 text-[12px]">
                  <b className="font-semibold">{s}</b> <span className="text-mute">{formatMoney(rimPrice(wheel, s, finishId), region)}</span>
                </span>
              ))}
            </div>
            {extra && extraFinish && (
              <p className="mt-2 text-[11px] text-mute">
                Prices shown in {extraFinish} (+{extra})
              </p>
            )}
          </div>
          <Button
            className="mt-7 w-full"
            variant="secondary"
            onClick={() => {
              onClose();
              onOpen360(wheel);
            }}
            icon={<Rotate3d className="h-4 w-4" strokeWidth={1.7} />}
          >
            View in 360°
          </Button>
        </div>
      )}
    </Modal>
  );
};

// ----------------------------------------------------
// ··· More options
// ----------------------------------------------------

export const MoreOptionsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  region: Region;
  onRegion: (r: Region) => void;
  onLoadCode: (code: string) => Promise<boolean>;
  onRestart: () => void;
  /** Opens the account sheet (sign-in, profile, garage). */
  onOpenAccount?: () => void;
  /** The site's other pages and the enquiry (the menu the showroom's top bar used to hold). */
  links?: { label: string; onClick: () => void }[];
}> = ({ open, onClose, region, onRegion, onLoadCode, onRestart, onOpenAccount, links }) => {
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  return (
    <Modal open={open} onClose={onClose} title="More options" width="max-w-md">
      <Eyebrow className="mb-3">Region and language</Eyebrow>
      <div className="grid gap-1.5">
        {BRAND.regions.map((r) => (
          <button
            key={r.id}
            onClick={() => onRegion(r)}
            className={cx(
              'flex items-center justify-between rounded-xl px-4 py-3 text-left text-[13px] transition',
              r.id === region.id ? 'bg-gold text-carbon' : 'bg-ink/[0.035] hover:bg-ink/[0.06]'
            )}
          >
            <span className="font-medium">{r.label}</span>
            <span className={r.id === region.id ? 'text-carbon/70' : 'text-mute'}>
              {r.language} · {r.currency}
            </span>
          </button>
        ))}
      </div>

      <Eyebrow className="mt-7 mb-3">Load a configuration</Eyebrow>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setState('loading');
          const ok = await onLoadCode(code);
          setState(ok ? 'idle' : 'error');
          if (ok) {
            setCode('');
            onClose();
          }
        }}
      >
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setState('idle');
          }}
          placeholder="e.g. K7QM4XR2PD"
          maxLength={12}
          className="h-11 flex-1 rounded-full bg-ink/[0.04] px-5 font-mono text-[13px] tracking-[0.18em] outline-none ring-1 ring-transparent focus:ring-ink/25"
        />
        <Button type="submit" disabled={code.trim().length < 10 || state === 'loading'}>
          {state === 'loading' ? 'Loading' : 'Load'}
        </Button>
      </form>
      {state === 'error' && <p className="mt-2 text-[12px] text-red-600">No configuration found for that code.</p>}

      {onOpenAccount && (
        <>
          <Eyebrow className="mt-7 mb-3">Account</Eyebrow>
          <button
            aria-label="Account & garage"
            onClick={() => {
              onClose();
              onOpenAccount();
            }}
            className="flex w-full items-center justify-between rounded-xl bg-ink/[0.035] px-4 py-3 text-left text-[13px] transition hover:bg-ink/[0.06]"
          >
            <span className="font-medium">Account &amp; garage</span>
            <span className="text-mute">Sign in · saved builds</span>
          </button>
        </>
      )}

      {links && links.length > 0 && (
        <>
          <Eyebrow className="mt-7 mb-3">More</Eyebrow>
          <nav aria-label="More pages" className="grid gap-1.5">
            {links.map((l) => (
              <button
                key={l.label}
                onClick={() => {
                  onClose();
                  l.onClick();
                }}
                className="flex w-full items-center justify-between rounded-xl bg-ink/[0.035] px-4 py-3 text-left text-[13px] font-medium transition hover:bg-ink/[0.06]"
              >
                {l.label}
                <ChevronRight className="h-4 w-4 text-mute" strokeWidth={1.8} />
              </button>
            ))}
          </nav>
        </>
      )}

      <button
        onClick={() => {
          onClose();
          onRestart();
        }}
        className="mt-7 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-mute hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Start again
      </button>
    </Modal>
  );
};
