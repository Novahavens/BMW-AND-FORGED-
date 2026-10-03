/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

/**
 * Small copies of the rim photos for lists and chips. The originals are 2048 px PNGs (1-2 MB);
 * each is fetched once, downscaled, and served as a blob URL to every thumbnail (image and tint
 * mask alike). The 3D engine fetches the same URL for the spokes, so the browser cache shares it.
 */
const THUMB_PX = 256;
const ready = new Map<string, string>();
const loading = new Map<string, Promise<string>>();

export function rimThumbUrl(url: string): Promise<string> {
  const done = ready.get(url);
  if (done) return Promise.resolve(done);
  let p = loading.get(url);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(String(res.status));
        const bitmap = await createImageBitmap(await res.blob());
        const c = document.createElement('canvas');
        c.width = c.height = THUMB_PX;
        const g = c.getContext('2d');
        if (!g) throw new Error('no 2d context');
        g.drawImage(bitmap, 0, 0, THUMB_PX, THUMB_PX);
        bitmap.close();
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
        return blob ? URL.createObjectURL(blob) : url;
      } catch {
        return url; // the full image, as before
      }
    })();
    p.then((u) => ready.set(url, u));
    loading.set(url, p);
  }
  return p;
}

/** The thumbnail URL for a rim photo, or null until it is ready (null too when there is no photo). */
export function useRimThumb(url?: string | null): string | null {
  const [src, setSrc] = useState<string | null>(() => (url ? ready.get(url) ?? null : null));
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const done = ready.get(url);
    if (done) {
      setSrc(done);
      return;
    }
    rimThumbUrl(url).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [url]);
  return url ? src : null;
}
