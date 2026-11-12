/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WheelDesign } from '../types';

const inches = (size: string) => parseFloat(size) || 0;

/** Sizes a rim is sold in, smallest first. Priced sizes win over the legacy size list. */
export function rimSizes(wheel: WheelDesign): string[] {
  const priced = wheel.priceBySize ? Object.keys(wheel.priceBySize) : [];
  const sizes = priced.length ? priced : wheel.standardSizes;
  return [...sizes].sort((a, b) => inches(a) - inches(b));
}

/**
 * Set price (4 wheels) for a size and, when given, a finish. The size price falls back to the single
 * set price. A finish with its own price (the stock sheet prices Polished Face and Liquid Metal above
 * the base finishes) raises the price to that figure: it never lowers a size price that is already
 * higher, so a dearer finish is always at least the size price.
 */
export function rimPrice(wheel: WheelDesign, size: string, finishId?: string): number {
  const p = wheel.priceBySize?.[size];
  const base = typeof p === 'number' ? p : wheel.pricePerSet;
  const f = finishId ? wheel.priceByFinish?.[finishId] : undefined;
  return typeof f === 'number' && f > base ? f : base;
}

/** How much more a finish costs than the base price at this size (0 for the base finishes). */
export function finishSurcharge(wheel: WheelDesign, size: string, finishId: string): number {
  return Math.max(0, rimPrice(wheel, size, finishId) - rimPrice(wheel, size));
}

/** Lowest set price across sizes (base finish), for "from" labels. */
export function rimFromPrice(wheel: WheelDesign): number {
  const prices = rimSizes(wheel).map((s) => rimPrice(wheel, s));
  return prices.length ? Math.min(...prices) : wheel.pricePerSet;
}

/** Keeps the chosen size if the rim offers it, else picks the nearest size it does offer. */
export function nearestRimSize(wheel: WheelDesign, size: string): string {
  const sizes = rimSizes(wheel);
  if (sizes.includes(size) || sizes.length === 0) return size;
  const target = inches(size);
  return sizes.reduce((best, s) => (Math.abs(inches(s) - target) < Math.abs(inches(best) - target) ? s : best));
}

export const formatPrice = (usd: number) => `$${usd.toLocaleString()}`;
