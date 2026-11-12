/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Car } from 'lucide-react';
import { WheelDesign, WheelFinish } from '../types';
import { finishSurcharge, nearestRimSize, rimPrice, rimSizes } from '../services/pricing';
import { Region, formatMoney } from '../config/brand';
import { Button, Eyebrow, FinishChip, IconButton, cx, wheelEyebrow } from './journey/ui';
import { WheelStage } from './WheelStage';

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
  /** Opens the enquiry form for this rim, finish and size (the Enquire button on the 3D stage). */
  onEnquire?: (wheel: WheelDesign, finish: WheelFinish, size: string) => void;
}

/**
 * A wheel on its own: the 3D wheel studio (or the wheel's photo when it has no model) beside its
 * name, finishes, sizes, price and the way onto a car.
 */
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
  onConfigure,
  onEnquire
}) => {
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

  // Switching rims keeps the finish/size when the new rim offers them
  useEffect(() => {
    if (!wheel) return;
    setFinish((f) => (f && wheel.availableVariants.includes(f.id) ? f : finishes[wheel.defaultVariant] ?? availableFinishes[0]));
    setSize((s) => nearestRimSize(wheel, s));
  }, [wheel?.id]);

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
    // A phone scrolls the whole page (the stage, then the details). From `lg` up, and on a phone on its
    // side, the stage fills the height beside the details, which scroll on their own.
    <div className="absolute inset-0 overflow-y-auto overscroll-contain bg-studio text-ink flex flex-col lg:flex-row lg:overflow-hidden short:flex-row short:overflow-hidden">
      {/* The stage: back and previous/next above the wheel studio */}
      <div className="flex shrink-0 flex-col gap-3 p-3 sm:p-4 lg:min-h-0 lg:min-w-0 lg:flex-1 lg:shrink lg:p-5 short:min-h-0 short:min-w-0 short:flex-1 short:shrink short:gap-2 short:p-2">
        <div className="flex items-center justify-between gap-3">
          <Button variant="light" size="sm" onClick={onBack} className="pl-3 min-w-0">
            <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.8} /> <span className="truncate">{backLabel}</span>
          </Button>
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface/85 backdrop-blur p-1 ring-1 ring-line">
            <IconButton label={`Previous: ${prev.name}`} onClick={() => onOpenRim(prev.id)}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <span className="px-1 text-[10.5px] font-semibold tabular-nums tracking-[0.14em] text-mute" aria-hidden>
              {index + 1} / {wheels.length}
            </span>
            <IconButton label={`Next: ${next.name}`} onClick={() => onOpenRim(next.id)}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <WheelStage
          wheel={wheel}
          finishes={availableFinishes}
          finish={finish}
          onSelectFinish={setFinish}
          onEnquire={onEnquire && finish ? () => onEnquire(wheel, finish, size) : undefined}
          // the website's stage height on a phone; beside the details it takes the height that is there
          className="h-[76dvh] min-h-[540px] max-h-[860px] lg:h-auto lg:min-h-0 lg:max-h-none lg:flex-1 short:h-auto short:min-h-0 short:max-h-none short:flex-1"
        />
      </div>

      {/* Details */}
      <aside className="w-full shrink-0 lg:w-[var(--panel-w)] lg:min-h-0 lg:overflow-y-auto short:w-[min(360px,46vw)] short:min-h-0 short:overflow-y-auto overscroll-contain bg-surface lg:border-l short:border-l border-line px-6 sm:px-7 py-7 space-y-7 shadow-panel">
        <div key={wheel.id} className="animate-rise">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-bronze">{wheelEyebrow(wheel)}</div>
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
                title={`${f.name}${finishSurcharge(wheel, size, f.id) ? ` · +${money(finishSurcharge(wheel, size, f.id))}` : ''}`}
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
            <div className="mt-1 font-display text-[26px] font-extrabold tabular-nums">{money(rimPrice(wheel, size, finish?.id))}</div>
          </div>
          {(wheel.weightFrontKg > 0 || wheel.weightRearKg > 0) && (
            <div className="text-right text-[12px] text-mute">
              {wheel.weightFrontKg} kg front<br />{wheel.weightRearKg} kg rear
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Button size="lg" className="w-full" onClick={() => finish && onConfigure(wheel, finish, size)} icon={<Car className="h-4 w-4" strokeWidth={1.7} />}>
            See it on my car
          </Button>
          {onEnquire && (
            <Button variant="secondary" size="lg" className="w-full" onClick={() => finish && onEnquire(wheel, finish, size)}>
              Enquire about this wheel
            </Button>
          )}
        </div>

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
