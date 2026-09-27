/**
 * Web Worker for convertCadFile (services/cadToGlb.ts): runs the shared CAD -> rim GLB pipeline
 * off the main thread. OpenCascade (occt-import-js, ~7 MB wasm) is fetched only when a
 * STEP/IGES/BREP file is converted; STL/OBJ never download it.
 */
import occtJsUrl from 'occt-import-js/dist/occt-import-js.js?url';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';
import { convertToGlb } from './cadToGlbCore.js';

export type CadWorkerRequest = { name: string; bytes: ArrayBuffer; options?: Record<string, unknown> };
export type CadWorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'done'; glb: ArrayBuffer; stats: Record<string, unknown>; warnings: string[] }
  | { type: 'error'; message: string };

const scope = self as unknown as {
  postMessage(msg: CadWorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<CadWorkerRequest>) => void) | null;
};

/**
 * The emscripten loader is a UMD script, not an ES module, so it is fetched as text and
 * evaluated to get its factory; locateFile points it at the hashed wasm asset.
 */
async function loadOcct() {
  const res = await fetch(occtJsUrl);
  if (!res.ok) throw new Error(`could not download OpenCascade (${res.status})`);
  const code = await res.text();
  const factory = new Function(`${code}\n;return occtimportjs;`)() as (m: object) => Promise<unknown>;
  return factory({
    locateFile: (p: string) => (p.endsWith('.wasm') ? occtWasmUrl : p),
    print: () => {},
    printErr: () => {}
  });
}

scope.onmessage = async (e) => {
  const { name, bytes, options } = e.data;
  try {
    const { glb, stats, warnings } = await convertToGlb(new Uint8Array(bytes), name, {
      options,
      loadOcct,
      log: (message: string) => scope.postMessage({ type: 'progress', message }),
      warn: (message: string) => scope.postMessage({ type: 'warning', message }),
      generator: 'BMW-AND-FORGED /admin convertCadFile'
    });
    const out = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    scope.postMessage({ type: 'done', glb: out, stats, warnings }, [out]);
  } catch (err) {
    scope.postMessage({ type: 'error', message: (err as Error)?.message || String(err) });
  }
};
