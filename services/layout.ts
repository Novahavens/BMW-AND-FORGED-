/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

/**
 * One definition of "which layout is this device getting", shared by the CSS and the 3D camera.
 *
 * The configurator has two arrangements:
 * - **sheet:** the controls are a bottom sheet under the car (portrait phones, small tablets).
 * - **panel:** the controls are a column beside the car (landscape phones, tablets in landscape,
 *   laptops and desktops).
 *
 * The same query is the Tailwind `sheet:` variant (tailwind.config.cjs), so a class and the camera's
 * view offset can never disagree (they used to: Tailwind switched at 640 px, the camera at 640 px
 * of width alone, and a 700 px-wide landscape phone got a 400 px column and a 350 px-wide car).
 *
 * Sheet: narrower than 900 px AND at least 520 px tall. A phone on its side (about 390 px tall) has
 * no height for a sheet, so it gets the panel, narrower.
 */
export const SHEET_QUERY = '(max-width: 899px) and (min-height: 520px)';

/** Width of the side panel in CSS px: 28% of the screen, between 340 and 460. */
export const panelWidthFor = (viewportWidth: number) => Math.round(Math.min(460, Math.max(340, viewportWidth * 0.28)));

/** Height of the bottom sheet in CSS px: about half the screen, between 280 and 560. */
export const sheetHeightFor = (viewportHeight: number) => Math.round(Math.min(560, Math.max(280, viewportHeight * 0.52)));

export type LayoutMode = 'sheet' | 'panel';

export const layoutMode = (): LayoutMode =>
  typeof window !== 'undefined' && window.matchMedia(SHEET_QUERY).matches ? 'sheet' : 'panel';

/** How much of the screen the configurator's controls cover, for the camera to centre the car in the rest. */
export const controlsInset = (): { right: number; bottom: number } =>
  layoutMode() === 'sheet' ? { right: 0, bottom: sheetHeightFor(window.innerHeight) } : { right: panelWidthFor(window.innerWidth), bottom: 0 };

/** The current layout mode, updated when the device is rotated or the window resized. */
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(layoutMode);
  useEffect(() => {
    const mq = window.matchMedia(SHEET_QUERY);
    const onChange = () => setMode(mq.matches ? 'sheet' : 'panel');
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mode;
}
