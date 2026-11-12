/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useId, useRef } from 'react';
import { renderedRimThumb, useRimThumb } from '../../services/rimThumbs';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { PaintColor, WheelDesign, WheelFinish } from '../../types';
import { RimFaceSvg } from './RimFaceSvg';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Brand mark: the logo image when configured, else the wordmark. */
export const Logo: React.FC<{ className?: string; size?: 'sm' | 'md' | 'lg' }> = ({ className, size = 'md' }) => {
  // The wordmark is ~9.5:1, so heights stay small to keep it inside a phone header.
  const h = size === 'lg' ? 'h-6 sm:h-8' : size === 'sm' ? 'h-3.5 sm:h-4' : 'h-4 sm:h-5';
  if (BRAND.logoUrl)
    return <img src={BRAND.logoSvgUrl || BRAND.logoUrl} alt={BRAND.name} draggable={false} className={cx(h, 'w-auto select-none', className)} />;
  const text = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-sm' : 'text-lg';
  return (
    <span className={cx('font-display font-extrabold tracking-[0.32em] text-ink select-none', text, className)}>
      {BRAND.name}
    </span>
  );
};

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'light';

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; icon?: React.ReactNode }
> = ({ variant = 'primary', size = 'md', icon, className, children, ...rest }) => (
  <button
    {...rest}
    className={cx(
      'group inline-flex items-center justify-center gap-2.5 rounded-full font-semibold uppercase tracking-[0.14em] transition-all duration-300 ease-lux disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]',
      size === 'sm' && 'h-10 sm:h-11 px-4 text-[10.5px]',
      size === 'md' && 'h-11 px-6 text-[11px]',
      size === 'lg' && 'h-14 px-8 text-[12px]',
      variant === 'primary' && 'bg-ember text-carbon hover:bg-ember-light shadow-ember font-bold',
      variant === 'secondary' && 'bg-surface text-ink ring-1 ring-line hover:ring-ink/30',
      variant === 'ghost' && 'text-ink hover:bg-ink/[0.05]',
      variant === 'light' && 'bg-surface/80 backdrop-blur text-ink ring-1 ring-line hover:bg-surface',
      className
    )}
  >
    {children}
    {icon}
  </button>
);

export const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }> = ({
  label,
  active,
  className,
  children,
  ...rest
}) => (
  <button
    {...rest}
    aria-label={label}
    title={label}
    className={cx(
      'inline-flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 ease-lux active:scale-95',
      active ? 'bg-gold text-carbon' : 'text-ink hover:bg-ink/[0.06]',
      className
    )}
  >
    {children}
  </button>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('text-[10.5px] font-semibold uppercase tracking-[0.28em] text-mute', className)}>{children}</div>
);

/** Polite live region for progress and success text ("Saving your build…", "Link copied"). Keep it mounted and swap
 *  its children: a live region announces changes, not its own arrival. Takes no space while empty. */
export const Status: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className, children, ...rest }) => (
  <p {...rest} role="status" aria-live="polite" aria-atomic="true" className={cx('text-[12.5px] leading-relaxed text-mute', className)}>
    {children}
  </p>
);

/** Error text announced as soon as it renders (role=alert is assertive). Render it only while there is an error. */
export const Alert: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className, children, ...rest }) => (
  <p {...rest} role="alert" className={cx('text-[12.5px] leading-relaxed text-red-400', className)}>
    {children}
  </p>
);

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';

/** Tab stops inside `root` in DOM order; anything display:none is skipped. */
const focusablesIn = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);

const TEXT_ENTRY = 'textarea, [contenteditable], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="file"])';

/**
 * While a modal is open everything else under <body> (the app root, other portals) is made inert: unfocusable,
 * unclickable and hidden from assistive tech. Ref-counted per element so stacked modals can release in any order,
 * and an `inert` somebody else set is left alone.
 */
const inertHolds = new WeakMap<Element, { count: number; ours: boolean }>();
const holdInertExcept = (keep: Element) => {
  const held: Element[] = [];
  for (const el of Array.from(document.body.children)) {
    if (el === keep || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName)) continue;
    const h = inertHolds.get(el) ?? { count: 0, ours: !el.hasAttribute('inert') };
    h.count++;
    inertHolds.set(el, h);
    if (h.ours) el.setAttribute('inert', '');
    held.push(el);
  }
  return () => {
    for (const el of held) {
      const h = inertHolds.get(el);
      if (!h || --h.count > 0) continue;
      inertHolds.delete(el);
      if (h.ours) el.removeAttribute('inert');
    }
  };
};

/** The modal rendered last is the one on top; only it answers Escape and Tab. */
const isTopDialog = (el: Element) => {
  const dialogs = document.body.querySelectorAll(':scope > [role="dialog"]');
  return dialogs[dialogs.length - 1] === el;
};

/**
 * Centered dialog on desktop, bottom sheet on phones. A real modal: focus moves inside on open (an autoFocus child,
 * else the first control of the body, else the panel), Tab and Shift+Tab stay inside, the rest of the page is inert,
 * Escape and the backdrop close it, and focus goes back to whatever opened it.
 */
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  /** Replaces the panel's surface, radius and height classes (e.g. the account sheet's glass column). */
  panelClassName?: string;
}> = ({ open, onClose, title, children, width = 'max-w-lg', panelClassName }) => {
  const titleId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Where focus returns on close: whatever had it as the dialog opened. Read during the render that opens it, because
  // a child with autoFocus (a notice's Confirm button) takes focus before any effect of this component runs.
  const openerRef = useRef<Element | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current) openerRef.current = document.activeElement;
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    const panel = panelRef.current;
    if (!wrap || !panel) return;
    const releaseInert = holdInertExcept(wrap);

    if (!panel.contains(document.activeElement)) {
      const first = bodyRef.current ? focusablesIn(bodyRef.current)[0] : undefined;
      // On a touch screen a text field would raise the keyboard over the sheet before anything was read
      const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      if (first && !(coarse && first.matches(TEXT_ENTRY))) first.focus();
      else panel.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || !isTopDialog(wrap)) return;
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const stops = focusablesIn(panel);
      if (!stops.length) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const i = stops.indexOf(document.activeElement as HTMLElement);
      let next: HTMLElement | undefined;
      // focus on the panel, on something inside that is not a stop, or lost to <body>: start again from the edge
      if (i === -1) next = e.shiftKey ? stops[stops.length - 1] : stops[0];
      else if (e.shiftKey && i === 0) next = stops[stops.length - 1];
      else if (!e.shiftKey && i === stops.length - 1) next = stops[0];
      if (next) {
        e.preventDefault();
        next.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      releaseInert();
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener) && !opener.closest('[inert]')) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      ref={wrapRef}
      className="stage-dark fixed inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-auto select-text"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px] animate-fade" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          'relative w-full shadow-panel animate-rise overflow-y-auto overscroll-contain',
          panelClassName ?? 'bg-surface rounded-t-[28px] sm:rounded-[28px] max-h-[88dvh]',
          width
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-surface/90 backdrop-blur px-7 pt-6 pb-3">
          <h2 id={titleId} className="font-display text-[15px] font-bold uppercase tracking-[0.08em]">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X className="h-5 w-5" strokeWidth={1.6} />
          </IconButton>
        </div>
        <div ref={bodyRef} className="px-7 pb-7">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
};

/** Paint chip rendered like a lacquered sphere. */
export const PaintChip: React.FC<{ paint: Pick<PaintColor, 'hex' | 'type'>; size?: number; className?: string }> = ({
  paint,
  size = 44,
  className
}) => {
  const matte = paint.type === 'Frozen';
  return (
    <span
      className={cx('inline-block rounded-full ring-1 ring-white/10', className)}
      style={{
        width: size,
        height: size,
        background: matte
          ? `radial-gradient(circle at 35% 30%, ${shade(paint.hex, 0.18)} 0%, ${paint.hex} 55%, ${shade(paint.hex, -0.35)} 100%)`
          : `radial-gradient(circle at 32% 26%, ${shade(paint.hex, 0.75)} 0%, ${shade(paint.hex, 0.15)} 18%, ${paint.hex} 48%, ${shade(paint.hex, -0.55)} 100%)`
      }}
    />
  );
};

/** Finish chip: brushed-metal cone in the finish colour. */
export const FinishChip: React.FC<{ finish: Pick<WheelFinish, 'hex' | 'roughness'>; size?: number; className?: string }> = ({
  finish,
  size = 44,
  className
}) => (
  <span
    className={cx('inline-block rounded-full ring-1 ring-white/10', className)}
    style={{
      width: size,
      height: size,
      background: `conic-gradient(from 210deg, ${shade(finish.hex, 0.55)}, ${shade(finish.hex, -0.35)} 25%, ${shade(finish.hex, 0.4)} 50%, ${shade(finish.hex, -0.45)} 75%, ${shade(finish.hex, 0.55)})`
    }}
  />
);

/** Thumbnail tint for a finish: the 3D view multiplies the grey rim image by the finish colour, and so
 *  does this, with a floor so a gloss-black wheel still shows its spokes without studio lighting. */
const thumbTint = (hex?: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  // Lift dark finishes so the spokes still read on the dark panel, but keep them apart: Black Gloss,
  // Black Matte and Hyper Black map to three different greys instead of one clamped value
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(0x30 + c * 0.8));
  return `rgb(${ch.join(',')})`;
};

/** Rim thumbnail: the render of the rim's 3D file in this finish, else the uploaded front-on PNG tinted by the
 *  finish, else the drawn preview. */
export const RimThumb: React.FC<{ wheel: WheelDesign; finish?: WheelFinish; size?: number; className?: string }> = ({
  wheel,
  finish,
  size = 72,
  className
}) => {
  // A thumbnail rendered from the rim's own 3D file in this finish, when there is one: no tint needed.
  const rendered = renderedRimThumb(wheel.id, finish?.id ?? wheel.defaultVariant);
  // The rim PNGs are 2048 px (1-2 MB each); a list of nine at 54 px loaded every one twice (image
  // and mask). One downscaled copy per photo serves both.
  const src = useRimThumb(rendered ? null : wheel.imageUrl);
  if (rendered)
    return (
      <div className={cx('relative drop-shadow-[0_8px_14px_rgba(0,0,0,0.55)]', className)} style={{ width: size, height: size }}>
        <img src={rendered} alt="" draggable={false} decoding="async" className="h-full w-full object-contain" />
      </div>
    );
  if (!wheel.imageUrl) return <RimFaceSvg wheel={wheel} finishHex={finish?.hex} size={size} className={className} />;
  const tint = thumbTint(finish?.hex);
  if (!src) return <div className={className} style={{ width: size, height: size }} aria-hidden />;
  const mask = `url("${src}") center / contain no-repeat`;
  return (
    <div className={cx('relative drop-shadow-[0_8px_14px_rgba(0,0,0,0.55)]', className)} style={{ width: size, height: size }}>
      {/* The image is a light neutral grey (it doubles as metal reflectance in 3D); a touch of contrast
          keeps it reading as metal rather than white on the dark theme. */}
      <img src={src} alt="" className="h-full w-full object-contain" style={{ filter: 'contrast(1.18) brightness(0.9)' }} />
      {tint && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundColor: tint, mixBlendMode: 'multiply', mask, WebkitMask: mask }}
        />
      )}
    </div>
  );
};

/** The small label over a wheel's name: its code when that says something the name does not, else its
 *  construction (the stock-sheet wheels are named by their code, so "FSA004" over "FSA004" said nothing). */
export const wheelEyebrow = (w: WheelDesign) =>
  w.code && w.code.trim().toLowerCase() !== w.name.trim().toLowerCase() ? w.code : w.style;

export const Divider: React.FC<{ className?: string }> = ({ className }) => <div className={cx('h-px bg-line', className)} />;
