/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web Worker: reads a rim photo into a spoke mask (processRimPhoto, about a second of pixel work)
 * off the main thread, so the configurator keeps responding while a new wheel is prepared.
 * Driven by rimFaceAsync.ts.
 */
import { processRimPhoto, RimPhotoOptions } from './wheelKit';

export interface RimFaceJob {
  id: number;
  image: ImageBitmap;
  out: number;
  opts: RimPhotoOptions;
}
export interface RimFaceResult {
  id: number;
  mask: { data: Float32Array; size: number; symmetry: number; mode: string } | null;
  error?: string;
}

const scope = self as unknown as { onmessage: ((e: MessageEvent<RimFaceJob>) => void) | null; postMessage: (m: RimFaceResult, transfer?: Transferable[]) => void };

scope.onmessage = (e) => {
  const { id, image, out, opts } = e.data;
  try {
    const m = processRimPhoto(image, out, opts);
    image.close();
    if (!m) {
      scope.postMessage({ id, mask: null });
      return;
    }
    scope.postMessage({ id, mask: { data: m.data, size: m.size, symmetry: m.symmetry, mode: m.mode } }, [m.data.buffer]);
  } catch (err) {
    scope.postMessage({ id, mask: null, error: String(err) });
  }
};
