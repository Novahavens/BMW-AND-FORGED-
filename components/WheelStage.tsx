/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useMemo, useState, type ComponentType } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { WheelDesign, WheelFinish } from '../types';
import type { StudioFinish } from '../shared/wheel-viewer';
import { configuratorPaint } from '../services/wheelViewerPaint';
import { RimFaceSvg } from './journey/RimFaceSvg';

/**
 * React.lazy with a couple of retries before giving up: a dropped packet on a phone should not
 * surface as a hard failure. A chunk that is really gone (a stale deploy asking for an old hash)
 * still rejects after the retries and reaches the error boundary below.
 */
function lazyWithRetry<P>(factory: () => Promise<{ default: ComponentType<P> }>, retries = 2, delayMs = 500) {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
    throw lastError;
  });
}

// The shared wheel viewer (shared/wheel-viewer, one copy for this app and the website) and three's orbit controls
// are only downloaded when a rim page shows a 3D model.
const WheelStudio = lazyWithRetry(() => import('../shared/wheel-viewer').then((m) => ({ default: m.WheelStudio })));

/** A catalogue finish as the viewer's row. */
const toStudioFinish = (f: WheelFinish): StudioFinish => ({
  id: f.id,
  name: f.name,
  swatchHex: f.hex,
  paint: { hex: f.hex, metalness: f.metalness, roughness: f.roughness, clearcoat: f.clearcoat }
});

export interface WheelStageProps {
  wheel: WheelDesign;
  /** The finishes the wheel is offered in: its availableVariants, looked up in the catalogue. */
  finishes: WheelFinish[];
  finish?: WheelFinish;
  onSelectFinish: (finish: WheelFinish) => void;
  onEnquire?: () => void;
  /** Size of the stage (Tailwind classes). The default is the website's: 76% of the screen height, 540 to 860 px. */
  className?: string;
}

const DEFAULT_SIZE = 'h-[76vh] min-h-[540px] max-h-[860px]';
/** The stage's frame (index.css .wheel-stage), shared by the studio's stand-ins below. */
const frame = (size: string) => `wheel-stage relative w-full select-none text-ink ${size}`;

/** Wheel name and subtitle, top left, where the studio shows them. */
const StageTitle = ({ wheel }: { wheel: WheelDesign }) => (
  <div className="absolute top-0 inset-x-0 z-10 p-4 pointer-events-none">
    <div className="font-display text-lg font-extrabold tracking-wide truncate">{wheel.name}</div>
    <div className="hidden sm:block text-xs text-mute mt-0.5 truncate">{wheel.subtitle}</div>
  </div>
);

/** While the studio's code is on its way: the same stage and message the studio shows while the model loads. */
const StageLoading = ({ className }: { className: string }) => (
  <div className={frame(className)} data-studio-state="loading">
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-mute">
        <Loader2 className="w-4 h-4 animate-spin text-ember" />
        Loading wheel…
      </div>
    </div>
  </div>
);

/**
 * Catches a failed download of the studio's code (after the retries above), so the rim page keeps its
 * details and buttons instead of crashing. React.lazy remembers a rejected import, so "retry" is a reload.
 */
class StageErrorBoundary extends React.Component<{ className: string; children: React.ReactNode }, { failed: boolean }> {
  // (the project has no React type package, so the base class does not describe these)
  declare props: { className: string; children: React.ReactNode };
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('WheelStudio failed to load:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={frame(this.props.className)} data-studio-state="error">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="w-6 h-6 text-ember" />
          <p className="text-sm text-ink/80">The 3D studio could not be loaded.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-surface px-4 py-1.5 text-[13px] cursor-pointer hover:bg-ink/[0.04]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reload page
          </button>
        </div>
      </div>
    );
  }
}

/** The finish as a tint for the wheel photo, lifted like the app's rim thumbnails so a black finish keeps its spokes. */
const photoTint = (hex?: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgb(${[n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(0x30 + c * 0.8)).join(',')})`;
};

/**
 * A wheel without a 3D model: its photo on the same stage, tinted by the finish (the photos are
 * neutral grey cut-outs, as for the thumbnails), or the drawn face when it has no photo either.
 */
const PhotoStage = ({ wheel, finish, className }: { wheel: WheelDesign; finish?: WheelFinish; className: string }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = wheel.imageUrl && wheel.imageUrl !== failedUrl ? wheel.imageUrl : null;
  const tint = photoTint(finish?.hex);
  const mask = src ? `url("${src}") center / contain no-repeat` : undefined;
  return (
    <div className={frame(className)} data-studio-state="photo">
      <StageTitle wheel={wheel} />
      <div className="absolute inset-x-6 top-16 bottom-8 sm:inset-x-10 sm:bottom-10 drop-shadow-[0_24px_28px_rgba(20,22,26,0.28)]">
        {src ? (
          <>
            <img
              src={src}
              alt={finish ? `${wheel.name} in ${finish.name}` : wheel.name}
              draggable={false}
              onError={() => setFailedUrl(src)}
              className="absolute inset-0 h-full w-full object-contain"
            />
            {tint && <div aria-hidden className="absolute inset-0" style={{ backgroundColor: tint, mixBlendMode: 'multiply', mask, WebkitMask: mask }} />}
          </>
        ) : (
          <RimFaceSvg wheel={wheel} finishHex={finish?.hex} size={480} className="absolute inset-0 h-full w-full" />
        )}
      </div>
    </div>
  );
};

/**
 * The stage on the rim page: the 3D wheel studio for a wheel that has a model (`modelUrl`, plus
 * `rearModelUrl` on a staggered set), the wheel's photo for one that does not.
 */
export const WheelStage = ({ wheel, finishes, finish, onSelectFinish, onEnquire, className = DEFAULT_SIZE }: WheelStageProps) => {
  const studioFinishes = useMemo(() => finishes.map(toStudioFinish), [finishes]);
  const selected = useMemo(() => (finish ? toStudioFinish(finish) : undefined), [finish]);
  if (!wheel.modelUrl) return <PhotoStage wheel={wheel} finish={finish} className={className} />;
  return (
    <StageErrorBoundary className={className}>
      <Suspense fallback={<StageLoading className={className} />}>
        <WheelStudio
          wheelModel={wheel.name}
          wheelSeries={wheel.subtitle}
          finishes={studioFinishes}
          selectedFinish={selected}
          onSelectFinish={(f) => {
            const row = finishes.find((x) => x.id === f.id);
            if (row) onSelectFinish(row);
          }}
          onEnquire={onEnquire}
          modelUrl={wheel.modelUrl}
          rearModelUrl={wheel.rearModelUrl}
          modelFlip={!!wheel.modelFlip}
          paint={configuratorPaint}
          className={`wheel-stage ${className}`}
        />
      </Suspense>
    </StageErrorBoundary>
  );
};
