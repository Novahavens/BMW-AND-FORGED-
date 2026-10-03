/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { processRimPhoto, RimPhotoOptions } from './wheelKit';
import type { RimFaceJob, RimFaceResult } from './rimFaceWorker';

type Mask = ReturnType<typeof processRimPhoto>;

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (m: Mask) => void; reject: (e: unknown) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      worker = null;
    } else {
      worker = new Worker(new URL('./rimFaceWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<RimFaceResult>) => {
        const job = pending.get(e.data.id);
        if (!job) return;
        pending.delete(e.data.id);
        if (e.data.error) job.reject(new Error(e.data.error));
        else job.resolve(e.data.mask as Mask);
      };
      worker.onerror = (e) => {
        console.warn('Rim face worker failed; reading rim photos on the main thread.', e.message);
        pending.forEach((job) => job.reject(new Error(e.message)));
        pending.clear();
        worker?.terminate();
        worker = null;
      };
    }
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * processRimPhoto in a Web Worker when the browser can (OffscreenCanvas + ImageBitmap), else inline.
 * Same result either way; the worker just keeps the page responsive during the second of pixel work.
 */
export async function processRimPhotoAsync(image: HTMLImageElement, out: number, opts: RimPhotoOptions): Promise<Mask> {
  const w = getWorker();
  if (w) {
    try {
      const bitmap = await createImageBitmap(image);
      const id = nextId++;
      return await new Promise<Mask>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const job: RimFaceJob = { id, image: bitmap, out, opts };
        w.postMessage(job, [bitmap]);
      });
    } catch (err) {
      console.warn('Rim face worker unavailable; reading the photo inline.', err);
    }
  }
  return processRimPhoto(image, out, opts);
}
