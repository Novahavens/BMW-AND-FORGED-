/**
 * In-browser CAD -> rim GLB conversion for /admin uploads to the `rim-models` bucket.
 * Same pipeline and defaults as `node scripts/cad-to-glb.mjs` (services/cadToGlbCore.js):
 * tessellate, orient to an X axle with the face towards +X, weld, simplify to 150k triangles,
 * creased normals, one "RimFinish" material, meshopt-compressed.
 *
 * The work runs in a Web Worker; OpenCascade's wasm (~7 MB, ~3 MB gzipped) is fetched only when
 * a STEP/IGES/BREP file is converted, so nothing here weighs on the customer-facing bundle as
 * long as this module is imported only by admin code.
 */
import type { CadWorkerResponse } from './cadToGlb.worker';

export const CAD_EXTENSIONS = ['.step', '.stp', '.iges', '.igs', '.brep', '.stl', '.obj'];

/** True when the file name has one of CAD_EXTENSIONS (i.e. it needs converting before upload). */
export function isCadFile(file: File | string): boolean {
  const name = (typeof file === 'string' ? file : file.name).toLowerCase();
  return CAD_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export interface CadConvertOptions {
  axis?: 'x' | 'y' | 'z' | null;
  flip?: boolean;
  units?: 'mm' | 'cm' | 'm' | 'in' | null;
  maxTris?: number;
  error?: number;
  crease?: number;
  deflection?: number;
  diameter?: number | null;
}

export interface CadConvertStats {
  inputTriangles: number;
  triangles: number;
  vertices: number;
  bytes: number;
  diameterMm: number;
  widthMm: number;
  bboxMin: number[];
  bboxMax: number[];
  sourceAxis: 'x' | 'y' | 'z';
  faceSign: 1 | -1;
  faceConfidence: number;
  seconds: number;
}

/** Stats and warnings of the most recent conversion, attached to the returned File. */
export type ConvertedGlbFile = File & { cadStats?: CadConvertStats; cadWarnings?: string[] };

/**
 * Converts a STEP/STP/IGES/IGS/BREP/STL/OBJ file into `<basename>.glb`, ready for uploadAsset.
 * `onProgress` receives human-readable status lines (warnings are prefixed "Warning: ").
 * Rejects with a readable Error if the file cannot be converted.
 */
export async function convertCadFile(
  file: File,
  onProgress?: (msg: string) => void,
  options?: CadConvertOptions
): Promise<File> {
  if (!isCadFile(file)) throw new Error(`${file.name} is not a CAD file (${CAD_EXTENSIONS.join(', ')})`);
  const bytes = await file.arrayBuffer();
  const worker = new Worker(new URL('./cadToGlb.worker.ts', import.meta.url), { type: 'module' });
  onProgress?.(`Converting ${file.name}...`);
  try {
    const result = await new Promise<Extract<CadWorkerResponse, { type: 'done' }>>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<CadWorkerResponse>) => {
        const msg = e.data;
        if (msg.type === 'progress') onProgress?.(msg.message);
        else if (msg.type === 'warning') onProgress?.(`Warning: ${msg.message}`);
        else if (msg.type === 'done') resolve(msg);
        else reject(new Error(`Could not convert ${file.name}: ${msg.message}`));
      };
      worker.onerror = (e) => {
        e.preventDefault();
        reject(new Error(`Could not convert ${file.name}: ${e.message || 'the converter crashed (file too large?)'}`));
      };
      worker.postMessage({ name: file.name, bytes, options }, [bytes]);
    });
    const base = file.name.replace(/\.[^.]+$/, '') || 'rim';
    const out = new File([result.glb], `${base}.glb`, { type: 'model/gltf-binary' }) as ConvertedGlbFile;
    out.cadStats = result.stats as unknown as CadConvertStats;
    out.cadWarnings = result.warnings;
    return out;
  } finally {
    worker.terminate(); // frees the OpenCascade heap
  }
}
