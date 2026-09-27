/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { PaintColor, WheelDesign, WheelFinish } from '../../types';
import { RimFaceSvg } from './RimFaceSvg';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Brand mark: the logo image when configured, else the wordmark. */
export const Logo: React.FC<{ className?: string; size?: 'sm' | 'md' | 'lg' }> = ({ className, size = 'md' }) => {
  const h = size === 'lg' ? 'h-10' : size === 'sm' ? 'h-5' : 'h-7';
  if (BRAND.logoUrl) return <img src={BRAND.logoUrl} alt={BRAND.name} className={cx(h, 'w-auto', className)} />;
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
      size === 'sm' && 'h-9 px-4 text-[10.5px]',
      size === 'md' && 'h-11 px-6 text-[11px]',
      size === 'lg' && 'h-14 px-8 text-[12px]',
      variant === 'primary' && 'bg-ink text-white hover:bg-black shadow-float',
      variant === 'secondary' && 'bg-white text-ink ring-1 ring-line hover:ring-ink/30',
      variant === 'ghost' && 'text-ink hover:bg-ink/[0.05]',
      variant === 'light' && 'bg-white/80 backdrop-blur text-ink ring-1 ring-line hover:bg-white',
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
      active ? 'bg-ink text-white' : 'text-ink hover:bg-ink/[0.06]',
      className
    )}
  >
    {children}
  </button>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('text-[10.5px] font-semibold uppercase tracking-[0.28em] text-mute', className)}>{children}</div>
);

/** Centered dialog on desktop, bottom sheet on phones. */
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}> = ({ open, onClose, title, children, width = 'max-w-lg' }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-auto select-text" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[3px] animate-fade" onClick={onClose} />
      <div
        className={cx(
          'relative w-full bg-white shadow-panel animate-rise rounded-t-[28px] sm:rounded-[28px] max-h-[88vh] overflow-y-auto',
          width
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-white/90 backdrop-blur px-7 pt-6 pb-3">
          <div className="font-display text-[15px] font-bold uppercase tracking-[0.08em]">{title}</div>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X className="h-5 w-5" strokeWidth={1.6} />
          </IconButton>
        </div>
        <div className="px-7 pb-7">{children}</div>
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
      className={cx('inline-block rounded-full ring-1 ring-black/10', className)}
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
    className={cx('inline-block rounded-full ring-1 ring-black/10', className)}
    style={{
      width: size,
      height: size,
      background: `conic-gradient(from 210deg, ${shade(finish.hex, 0.55)}, ${shade(finish.hex, -0.35)} 25%, ${shade(finish.hex, 0.4)} 50%, ${shade(finish.hex, -0.45)} 75%, ${shade(finish.hex, 0.55)})`
    }}
  />
);

/** Rim thumbnail: the uploaded front-on PNG, else the drawn preview. */
export const RimThumb: React.FC<{ wheel: WheelDesign; finish?: WheelFinish; size?: number; className?: string }> = ({
  wheel,
  finish,
  size = 72,
  className
}) =>
  wheel.imageUrl ? (
    <img
      src={wheel.imageUrl}
      alt=""
      className={cx('object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.18)]', className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <RimFaceSvg wheel={wheel} finishHex={finish?.hex} size={size} className={className} />
  );

export const Divider: React.FC<{ className?: string }> = ({ className }) => <div className={cx('h-px bg-line', className)} />;
