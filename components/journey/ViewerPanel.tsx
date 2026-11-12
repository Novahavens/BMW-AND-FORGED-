/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowRight, ChevronLeft, ClipboardList, Info, MoreHorizontal, Rotate3d } from 'lucide-react';
import { Region, formatMoney } from '../../config/brand';
import { CameraViewPreset, CarModel, PaintColor, WheelDesign, WheelFinish } from '../../types';
import { finishSurcharge, rimPrice, rimSizes } from '../../services/pricing';
import { Button, FinishChip, IconButton, PaintChip, RimThumb, cx } from './ui';
import { shortModelName } from './carNames';
import type { ConfigStep } from './Configurator';

/**
 * The configurator's controls laid out like the owner's vehicle spec viewer (car_viewer_web): one
 * glass panel with small uppercase section headings, round swatches in a six-column grid, pill chips
 * for views and motion, and the paint's name over the stage. The journey around it (welcome, summary,
 * PDF, enquiry) is untouched: every handler is the one App.tsx already passes to the configurator.
 */
export interface ViewerPanelProps {
  car: CarModel;
  cars?: CarModel[];
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
  /** Absent for a frames-only car (no turntable). */
  onToggleRotate?: () => void;
  onPaint: (paint: PaintColor) => void;
  onWheel: (wheel: WheelDesign) => void;
  onSize: (size: string) => void;
  onFinish: (finish: WheelFinish) => void;
  onSelectCar?: (car: CarModel) => void;
  onChangeModel: () => void;
  onSummary: () => void;
  onOpen360: (wheel: WheelDesign) => void;
  onInfo: (wheel: WheelDesign) => void;
  onOpenMore: () => void;
}

const VIEWS: { id: CameraViewPreset; label: string }[] = [
  { id: 'frontThreeQuarter', label: 'Front ¾' },
  { id: 'side', label: 'Side' },
  { id: 'rearThreeQuarter', label: 'Rear ¾' },
  { id: 'front', label: 'Front' },
  { id: 'frontWheel', label: 'Wheel' },
  { id: 'top', label: 'Top' }
];

/** Paint groups by finish, in the viewer's spirit (it grouped its library by range and finish). */
const PAINT_GROUPS: { type: PaintColor['type']; label: string }[] = [
  { type: 'Uni', label: 'Solid' },
  { type: 'Metallic', label: 'Metallic' },
  { type: 'Pearl', label: 'Pearl effect' },
  { type: 'Frozen', label: 'Frozen matte' }
];
export const paintTypeLabel = (type: PaintColor['type']) => PAINT_GROUPS.find((g) => g.type === type)?.label ?? type;

/**
 * Section heading: 11 px uppercase, dim, as in the viewer's panel. With `step` it is a button named
 * "Step N: X" (the journey's step ids, which the render harnesses and deep links drive) that scrolls the
 * section into view and tells the app, which frames the camera for it.
 */
const STEP_NUMBER: Record<Exclude<ConfigStep, 'overview'>, number> = { paint: 1, wheels: 2, size: 3, finish: 4 };
const H2: React.FC<{ children: React.ReactNode; aside?: React.ReactNode; className?: string; step?: Exclude<ConfigStep, 'overview'>; onStep?: (s: ConfigStep) => void }> = ({ children, aside, className, step, onStep }) => (
  // On the phone sheet the heading is a 40 px tap target (touch minimum), the margins trimmed to match
  <div className={cx('mt-4 mb-2 flex items-baseline justify-between gap-3 first:mt-0 sheet:mt-1.5 sheet:mb-0 sheet:items-center sheet:first:mt-0', className)}>
    {step ? (
      <button
        onClick={() => onStep?.(step)}
        aria-label={`Step ${STEP_NUMBER[step]}: ${String(children)}`}
        className="text-[11px] font-medium uppercase tracking-[0.08em] text-mute hover:text-ink sheet:inline-flex sheet:min-h-10 sheet:min-w-10 sheet:items-center"
      >
        {children}
      </button>
    ) : (
      <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-mute sheet:flex sheet:min-h-10 sheet:items-center">{children}</h2>
    )}
    {aside && <span className="truncate text-[11.5px] text-mute">{aside}</span>}
  </div>
);

/** Pill chip; pressed = Forged Gold. 32 px on desktop, a 40 px touch target on the phone sheet. */
const Chip: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }> = ({ active, className, children, ...rest }) => (
  <button
    {...rest}
    aria-pressed={!!active}
    className={cx(
      'h-8 sheet:h-10 sheet:min-w-10 rounded-lg px-2.5 text-[12px] leading-none ring-1 transition-all duration-200 ease-lux active:scale-[0.97]',
      active ? 'bg-gold text-carbon ring-gold font-semibold' : 'bg-ink/[0.06] text-ink ring-line hover:bg-ink/[0.1]',
      className
    )}
  >
    {children}
  </button>
);

/** Round swatch button (paint or finish) with the viewer's pressed outline. */
const Swatch: React.FC<{ active: boolean; title: string; onClick: () => void; children: React.ReactNode }> = ({ active, title, onClick, children }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={cx(
      'group flex aspect-square items-center justify-center rounded-full transition-transform duration-150 hover:scale-[1.08]',
      active ? 'outline outline-2 outline-ink outline-offset-2' : ''
    )}
  >
    {children}
  </button>
);

export const ViewerPanel: React.FC<ViewerPanelProps> = (p) => {
  const price = rimPrice(p.wheel, p.size, p.finish.id);
  const groups = useMemo(() => PAINT_GROUPS.map((g) => ({ ...g, paints: p.paints.filter((x) => x.type === g.type) })).filter((g) => g.paints.length), [p.paints]);
  const sizes = rimSizes(p.wheel);
  const finishes = p.wheel.availableVariants.map((id) => p.finishes[id]).filter(Boolean);
  const sections = useRef<Partial<Record<ConfigStep, HTMLElement | null>>>({});
  // A deep link or a "Change wheels" action lands on that section
  useEffect(() => {
    const el = p.step === 'overview' ? null : sections.current[p.step];
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [p.step]);

  return (
    <>
      {/* Stage header, top-left as in the viewer */}
      <div className="absolute top-4 left-4 sm:top-5 sm:left-6 z-30 animate-fade pointer-events-none [text-shadow:0_1px_8px_rgba(0,0,0,.45)]">
        <h1 className="font-display text-[15px] font-semibold tracking-[0.02em] text-ink">
          {p.car.name}
          {p.car.generation ? <span className="text-mute"> · {p.car.generation}</span> : null}
        </h1>
        <p className="mt-0.5 text-[12px] text-mute">Drag to orbit · scroll or pinch to zoom</p>
        <button onClick={p.onChangeModel} className="pointer-events-auto mt-2 inline-flex h-8 sheet:h-10 items-center gap-1 rounded-lg bg-surface/70 px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink ring-1 ring-line backdrop-blur hover:bg-surface">
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} /> Change model
        </button>
      </div>

      {/* Paint name, bottom-left (top-left on phones, under the header) */}
      <div className="absolute z-30 left-4 sm:left-6 bottom-6 sheet:bottom-auto sheet:top-[120px] pointer-events-none animate-fade [text-shadow:0_1px_10px_rgba(0,0,0,.5)]">
        <div className="font-display text-[22px] sheet:text-[17px] short:text-[16px] font-semibold tracking-[-0.01em] text-ink">{p.paint.name}</div>
        <div className="mt-0.5 text-[12px] text-ink/70">
          Code {p.paint.code} · {paintTypeLabel(p.paint.type)} · {p.car.badge}
        </div>
      </div>

      {/* The panel: floating glass column on the right, a bottom sheet on phones */}
      <aside
        aria-label="Configurator"
        className="absolute z-40 flex flex-col animate-slide-in bg-surface/[0.82] backdrop-blur-xl ring-1 ring-line shadow-panel rounded-[14px]
          right-4 top-4 bottom-4 w-[calc(var(--panel-w)-32px)]
          sheet:inset-x-2.5 sheet:top-auto sheet:bottom-2.5 sheet:w-auto sheet:h-[var(--sheet-h)]"
      >
        <div className="hidden sheet:block mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink/15" />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-3 sheet:pt-2">
          {p.cars && p.onSelectCar && p.cars.length > 1 && (
            <section>
              <H2>Car</H2>
              <div className="flex flex-wrap gap-1.5">
                {p.cars.map((c) => (
                  <Chip key={c.id} active={c.id === p.car.id} onClick={() => c.id !== p.car.id && p.onSelectCar!(c)}>
                    {shortModelName(c)}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          <section ref={(el) => (sections.current.paint = el)}>
            <H2 step="paint" onStep={p.onStep} aside={`${p.paint.name} · ${p.paint.code}`}>
              Paint
            </H2>
            {groups.map((g) => (
              <div key={g.type} className="mb-2.5">
                {groups.length > 1 && <div className="mb-1.5 text-[11px] text-mute/80">{g.label}</div>}
                {/* On the sheet as many columns as fit at 40 px or more: every swatch a full touch target */}
                <div className="grid grid-cols-6 sheet:grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-2">
                  {g.paints.map((paint) => (
                    <Swatch key={paint.id} active={paint.id === p.paint.id} title={`${paint.name} (${paint.code})`} onClick={() => p.onPaint(paint)}>
                      <PaintChip paint={paint} size={34} className="ring-1 ring-white/20 shadow-[inset_0_-6px_10px_rgba(0,0,0,.35),inset_0_4px_8px_rgba(255,255,255,.25)]" />
                    </Swatch>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section ref={(el) => (sections.current.wheels = el)}>
            <H2 step="wheels" onStep={p.onStep} aside={p.wheel.name}>
              Wheels
            </H2>
            <ul data-section="wheels" className="grid grid-cols-4 sheet:grid-cols-5 gap-x-2 gap-y-3">
              {p.wheels.map((w) => {
                const active = w.id === p.wheel.id;
                return (
                  <li key={w.id} className="min-w-0">
                    <button onClick={() => p.onWheel(w)} title={w.name} aria-pressed={active} className="group flex w-full flex-col items-center text-center">
                      <span className={cx('rounded-full p-[2px] transition-all duration-200 ease-lux', active ? 'outline outline-2 outline-ink outline-offset-1' : 'group-hover:scale-[1.06]')}>
                        <RimThumb wheel={w} finish={active ? p.finish : p.finishes[w.defaultVariant] ?? p.finish} size={48} />
                      </span>
                      <span className={cx('mt-1.5 w-full truncate text-[11px] leading-tight', active ? 'text-ink font-semibold' : 'text-mute')}>{w.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex gap-1.5">
              <Chip onClick={() => p.onInfo(p.wheel)} aria-label="Wheel details" title="Wheel details" className="inline-flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" strokeWidth={1.7} /> Details
              </Chip>
              <Chip onClick={() => p.onOpen360(p.wheel)} aria-label="View in 360°" title="View in 360°" className="inline-flex items-center gap-1.5">
                <Rotate3d className="h-3.5 w-3.5" strokeWidth={1.7} /> 360°
              </Chip>
            </div>
          </section>

          <section ref={(el) => (sections.current.size = el)}>
            <H2 step="size" onStep={p.onStep} aside={formatMoney(price, p.region)}>
              Size
            </H2>
            <div className="flex flex-wrap gap-1.5">
              {sizes.map((s) => (
                <Chip key={s} active={s === p.size} onClick={() => p.onSize(s)} title={`${s} · ${formatMoney(rimPrice(p.wheel, s, p.finish.id), p.region)}`}>
                  {s}
                </Chip>
              ))}
            </div>
          </section>

          <section ref={(el) => (sections.current.finish = el)}>
            <H2 step="finish" onStep={p.onStep} aside={p.finish.name}>
              Finish
            </H2>
            <ul data-section="finish" className="grid grid-cols-6 sheet:grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-2">
              {finishes.map((f) => {
                const extra = finishSurcharge(p.wheel, p.size, f.id);
                return (
                  <li key={f.id}>
                    <Swatch
                      active={f.id === p.finish.id}
                      title={`${f.name} · ${f.colorName}${extra ? ` · +${formatMoney(extra, p.region)}` : ''}`}
                      onClick={() => p.onFinish(f)}
                    >
                      <FinishChip finish={f} size={34} className="ring-1 ring-white/20" />
                    </Swatch>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <H2>View</H2>
            <div className="flex flex-wrap gap-1.5">
              {VIEWS.map((v) => (
                <Chip key={v.id} active={p.cameraView === v.id} onClick={() => p.onCamera(v.id)}>
                  {v.label}
                </Chip>
              ))}
            </div>
          </section>

          {p.onToggleRotate && (
            <section>
              <H2>Motion</H2>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={p.autoRotate} onClick={p.onToggleRotate} title={p.autoRotate ? 'Stop turntable' : 'Turntable'}>
                  Auto-rotate
                </Chip>
              </div>
            </section>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-mute">
            Paint colours are visual approximations: BMW does not publish RGB values. Prices are for a set of four forged wheels, fitted.
          </p>
        </div>

        {/* Price and the one main action */}
        <div className="shrink-0 border-t border-line px-4 py-3 sheet:flex sheet:items-center sheet:gap-3">
          <div className="flex items-end justify-between gap-3 sheet:flex-col sheet:items-start sheet:gap-0 sheet:shrink-0">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">Wheel set of four</div>
              <div className="mt-0.5 truncate text-[12px] text-mute short:hidden sheet:hidden">
                {p.wheel.name} · {p.size} · {p.finish.name}
              </div>
            </div>
            <div className="shrink-0 font-display text-[20px] short:text-[17px] font-extrabold tabular-nums">{formatMoney(price, p.region)}</div>
          </div>
          <div className="mt-3 sheet:mt-0 flex items-center gap-2 sheet:flex-1 sheet:min-w-0">
            {/* One line on a phone: the label does not wrap, the summary icon steps aside (the button is the summary) */}
            <Button
              className="flex-1 min-w-0 whitespace-nowrap short:h-11 sheet:h-12 sheet:px-4"
              size="lg"
              onClick={p.onSummary}
              aria-label={`View your ${shortModelName(p.car)}`}
              icon={<ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1 [@media(max-width:374px)]:hidden" />}
            >
              {/* The full wording needs a wide footer; narrower screens get a label that never truncates */}
              <span className="hidden xl:inline">View your {shortModelName(p.car)}</span>
              <span className="xl:hidden">View build</span>
            </Button>
            <IconButton label="Summary" onClick={p.onSummary} className="shrink-0 bg-ink/[0.06] ring-1 ring-line sheet:hidden">
              <ClipboardList className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </IconButton>
            <IconButton label="More options" onClick={p.onOpenMore} className="shrink-0 bg-ink/[0.06] ring-1 ring-line">
              <MoreHorizontal className="h-5 w-5" strokeWidth={1.6} />
            </IconButton>
          </div>
        </div>
      </aside>
    </>
  );
};
