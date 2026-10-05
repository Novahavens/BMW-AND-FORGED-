/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web Worker: turns a rim photo (or prepared face mask) into the 3D spoke faces, entirely off the
 * main thread: it fetches and decodes the image, reads it into a spoke mask (processRimPhoto, about
 * a second of pixel work), traces the mask's outlines and extrudes the front and rear faces
 * (wheelKit buildSpokeFace). The geometry goes back as transferable typed arrays, so the page only
 * wraps them in BufferGeometry. Driven by rimFaceAsync.ts.
 */
import { processRimPhoto, RimPhotoOptions } from './wheelKit';
import { buildRimFace, GeometryData, serializeGeometry, traceRimFaceShapes } from './rimFaceBuild';

export interface RimFaceJob {
  id: number;
  /** Absolute URL of the image. */
  url: string;
  out: number;
  opts: RimPhotoOptions;
}
export interface RimFaceResult {
  id: number;
  faces: { front: GeometryData; rear: GeometryData } | null;
  error?: string;
}

const scope = self as unknown as { onmessage: ((e: MessageEvent<RimFaceJob>) => void) | null; postMessage: (m: RimFaceResult, transfer?: Transferable[]) => void };

scope.onmessage = async (e) => {
  const { id, url, out, opts } = e.data;
  try {
    // same request as three's TextureLoader (crossOrigin 'anonymous'), so the HTTP cache is shared
    const res = await fetch(url, { mode: 'cors', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const image = await createImageBitmap(await res.blob());
    let mask: ReturnType<typeof processRimPhoto>;
    try {
      mask = processRimPhoto(image, out, opts);
    } finally {
      image.close();
    }
    const shapes = mask && traceRimFaceShapes(mask);
    if (!shapes) {
      scope.postMessage({ id, faces: null });
      return;
    }
    const front = serializeGeometry(buildRimFace(shapes, true));
    const rear = serializeGeometry(buildRimFace(shapes, false));
    scope.postMessage({ id, faces: { front: front.data, rear: rear.data } }, [...front.transfer, ...rear.transfer]);
  } catch (err) {
    scope.postMessage({ id, faces: null, error: String(err) });
  }
};
