/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { processRimPhoto, RimPhotoOptions } from './wheelKit';
import { RimFaceGeometries, buildRimFace, deserializeGeometry, traceRimFaceShapes } from './rimFaceBuild';
import type { RimFaceJob, RimFaceResult } from './rimFaceWorker';

/**
 * 3D spoke faces from a rim image, built off the main thread (rimFaceWorker.ts: fetch, decode,
 * mask, trace, extrude). Jobs run one at a time through a queue: a wheel the customer picked
 * (`high`) goes ahead of wheels being prepared in the background (`low`), and low jobs only start
 * when the page is idle. Browsers without Worker/OffscreenCanvas build the same faces on the page,
 * one step per idle callback rather than in one long task.
 */

export type RimFacePriority = 'high' | 'low';

interface Job {
  key: string;
  url: string;
  out: number;
  opts: RimPhotoOptions;
  priority: RimFacePriority;
  promise: Promise<RimFaceGeometries | null>;
  resolve: (f: RimFaceGeometries | null) => void;
  reject: (e: unknown) => void;
}

let worker: Worker | null | undefined;
let nextId = 1;
const inWorker = new Map<number, Job>();
const queue: Job[] = [];
const jobs = new Map<string, Job>(); // queued or running, by key
let running: Job | null = null;
let waitingForIdle = false;

const jobKey = (url: string, out: number, opts: RimPhotoOptions) => `${url}|${out}|${JSON.stringify(opts)}`;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      worker = null;
    } else {
      worker = new Worker(new URL('./rimFaceWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<RimFaceResult>) => {
        const job = inWorker.get(e.data.id);
        if (!job) return;
        inWorker.delete(e.data.id);
        if (e.data.error) {
          // e.g. the worker could not fetch or decode it: the page tries once more itself
          console.warn('Rim face worker failed on this image; building it on the page.', e.data.error);
          runInline(job);
          return;
        }
        const f = e.data.faces;
        finish(job, f ? { front: deserializeGeometry(f.front), rear: deserializeGeometry(f.rear) } : null);
      };
      worker.onerror = (e) => {
        console.warn('Rim face worker failed; building rim faces on the page.', e.message);
        worker?.terminate();
        worker = null;
        const lost = [...inWorker.values()];
        inWorker.clear();
        lost.forEach(runInline);
      };
    }
  } catch {
    worker = null;
  }
  return worker;
}

function finish(job: Job, faces: RimFaceGeometries | null, error?: unknown) {
  jobs.delete(job.key);
  if (running === job) running = null;
  if (error !== undefined) job.reject(error);
  else job.resolve(faces);
  pump();
}

/** Runs when the page has a moment (each step of the fallback, and every background job). */
function idle(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout });
    else setTimeout(resolve, 16);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

/** The same build on the page, split into idle-time steps so no single task holds the page. */
async function runInline(job: Job) {
  running = job;
  try {
    const t = job.priority === 'high' ? 100 : 2000;
    const img = await loadImage(job.url);
    await idle(t);
    let mask: ReturnType<typeof processRimPhoto> = null;
    try {
      mask = processRimPhoto(img, job.out, job.opts);
    } catch (err) {
      console.warn('Could not read rim image pixels (CORS?); showing it flat.', err);
    }
    if (!mask) return finish(job, null);
    await idle(t);
    const shapes = traceRimFaceShapes(mask);
    if (!shapes) return finish(job, null);
    await idle(t);
    const front = buildRimFace(shapes, true);
    await idle(t);
    const rear = buildRimFace(shapes, false);
    finish(job, { front, rear });
  } catch (err) {
    finish(job, null, err);
  }
}

function pump() {
  if (running || !queue.length) return;
  const high = queue.find((j) => j.priority === 'high');
  if (high) return start(high);
  // Background work waits for an idle moment, and yields to anything picked meanwhile. Without a
  // worker it waits until it is picked: the photo-reading step is one long task on the page, and
  // a background one could hold up the very tap it was meant to speed up.
  if (waitingForIdle || !getWorker()) return;
  waitingForIdle = true;
  idle(2000).then(() => {
    waitingForIdle = false;
    if (!running && queue.length) start(queue.find((j) => j.priority === 'high') ?? queue[0]);
  });
}

function start(job: Job) {
  queue.splice(queue.indexOf(job), 1);
  running = job;
  const w = getWorker();
  if (!w) {
    runInline(job);
    return;
  }
  const id = nextId++;
  inWorker.set(id, job);
  const msg: RimFaceJob = { id, url: job.url, out: job.out, opts: job.opts };
  w.postMessage(msg);
}

/**
 * Front and rear spoke faces for a rim image (null if it has no usable outline). Calls for the
 * same image share one job; a `high` call promotes a queued `low` one.
 */
export function buildRimFacesAsync(url: string, opts: RimPhotoOptions, priority: RimFacePriority = 'high', out = 1024): Promise<RimFaceGeometries | null> {
  const abs = new URL(url, typeof location !== 'undefined' ? location.href : undefined).href;
  const key = jobKey(abs, out, opts);
  const existing = jobs.get(key);
  if (existing) {
    if (priority === 'high') existing.priority = 'high';
    pump();
    return existing.promise;
  }
  let resolve!: Job['resolve'];
  let reject!: Job['reject'];
  const promise = new Promise<RimFaceGeometries | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const job: Job = { key, url: abs, out, opts, priority, promise, resolve, reject };
  jobs.set(key, job);
  queue.push(job);
  pump();
  return promise;
}

/** Moves a queued background job for this image to the front (the customer just picked it). */
export function promoteRimFace(url: string, opts: RimPhotoOptions, out = 1024) {
  const abs = new URL(url, typeof location !== 'undefined' ? location.href : undefined).href;
  const job = jobs.get(jobKey(abs, out, opts));
  if (job && job.priority !== 'high') {
    job.priority = 'high';
    pump();
  }
}
