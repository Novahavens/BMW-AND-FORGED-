/**
 * Exports a car exactly as the engine places it (body only, stock wheels already hidden), plus
 * one camera per configurator view at the fixed stage aspect, to a GLB for Blender.
 *
 *   bunx vite --host 127.0.0.1 --port 5173      # dev server, in another shell
 *   node scripts/prerender/export-scene.cjs <carIndex> <out.glb>
 *   CAR_QUERY=<query> (env) is appended to engine.html's URL, e.g. '&model=/.scratch/private/x.glb&len=4.79&paintMatch=paint_'
 *   for a frames-only car: its licensed GLB stays in the git-ignored .scratch/ and is read from there at build time only.
 *   Besides <out>.wheels.json (Blender axes) it writes <out>.layout.json: the wheels in engine space keyed by corner and
 *   the body's half length and half width, which renders/manifest.json carries for a frames-only car (FramesLayout).
 *   IDLE_FRAMES=<ms> (env) hands the engine an animation frame only every <ms>: on software GL the export spends most of
 *   its minutes drawing frames nobody looks at, and the exported meshes, cameras and wheel positions do not depend on them.
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [,, carIdx, out] = process.argv;
const ASPECT = 1.6; // must match RENDER_ASPECT in components/journey/RenderedCarView.tsx
// One camera per view chip in the configurator (ViewerPanel VIEWS), so no chip falls back to the live model.
const VIEWS = ['frontThreeQuarter', 'side', 'rearThreeQuarter', 'frontWheel', 'top', 'front'];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', (e) => console.error('pageerror', e.message));
  if (+process.env.IDLE_FRAMES > 0) {
    await p.addInitScript((ms) => {
      const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
      const pending = new Map(); let next = 1;
      window.requestAnimationFrame = (cb) => {
        const id = next++;
        pending.set(id, { timer: setTimeout(() => pending.set(id, { frame: raf((t) => { pending.delete(id); cb(t); }) }), ms) });
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        const h = pending.get(id); if (!h) return;
        if (h.frame !== undefined) caf(h.frame); else clearTimeout(h.timer);
        pending.delete(id);
      };
    }, +process.env.IDLE_FRAMES);
  }
  await p.goto(`http://127.0.0.1:5173/scripts/render/engine.html?car=${carIdx}${process.env.CAR_QUERY || ''}`);
  await p.waitForFunction(() => window.done !== undefined, null, { timeout: 300000 });
  const { b64, wheels, layout } = await p.evaluate(async ({ ASPECT, VIEWS }) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
    const e = window.e;
    const root = new THREE.Scene();
    // Body meshes in world space; paint meshes are tagged so Blender can swap the material.
    e.bodyMeshGroup.updateMatrixWorld(true);
    e.bodyMeshGroup.traverse((o) => {
      if (!o.isMesh || o.userData.isOverlay || o.userData.modelCaliper) return; // our calipers draw live
      for (let a = o; a; a = a.parent) if (!a.visible) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const paint = mats.some((m) => m === e.carBodyMaterial || m.userData?.paintVariant);
      const geo = o.geometry.clone();
      for (const k of Object.keys(geo.attributes)) {           // dequantize for the exporter
        const at = geo.attributes[k];
        if (at.isInterleavedBufferAttribute || at.normalized || !(at.array instanceof Float32Array)) {
          const f = new Float32Array(at.count * at.itemSize);
          for (let i = 0; i < at.count; i++) for (let j = 0; j < at.itemSize; j++) f[i * at.itemSize + j] = at.getComponent(i, j);
          geo.setAttribute(k, new THREE.BufferAttribute(f, at.itemSize));
        }
      }
      geo.applyMatrix4(o.matrixWorld);
      const conv = (x) => {
        const s = new THREE.MeshStandardMaterial({ color: x.color || 0x222222, roughness: x.roughness ?? 0.5, metalness: x.metalness ?? 0, transparent: x.transparent, opacity: x.opacity ?? 1, map: x.map || null });
        const kind = x.userData?.partKind;
        // Lamps (used by render_car.py's authored_lamps): a lit part keeps its glow; a clear cover (transmissive in the engine,
        // which a standard material cannot say) is named 'lens'; the reflectors and housings behind it are named 'lamp', so
        // they can keep their own look instead of the satin black given to unnamed parts.
        if (x.emissive && x.emissive.r + x.emissive.g + x.emissive.b > 0) {
          s.emissive.copy(x.emissive); s.emissiveIntensity = x.emissiveIntensity ?? 1; s.emissiveMap = x.emissiveMap || null;
        }
        const clearCover = (x.transmission ?? 0) > 0.5 && kind !== 'glass' && kind !== 'tailLens';
        const lampPart = kind === 'other' && /light|lamp/i.test(`${o.name} ${x.name}`);
        s.name = paint ? 'PAINT' : clearCover ? 'lens' : lampPart ? 'lamp' : (kind || x.name || 'part');
        return s;
      };
      const m = new THREE.Mesh(geo, mats.length === 1 ? conv(mats[0]) : mats.map(conv));
      m.name = (paint ? 'PAINT_' : '') + (o.name || 'mesh');
      root.add(m);
    });
    for (const v of VIEWS) {
      e.setCameraPreset(v, { instant: true, aspect: ASPECT });
      const c = e.camera.clone(); c.aspect = ASPECT; c.updateProjectionMatrix();
      c.clearViewOffset(); c.position.copy(e.camera.position); c.quaternion.copy(e.camera.quaternion); c.scale.set(1, 1, 1);
      c.name = 'CAM_' + v; root.add(c);
    }
    const buf = await new GLTFExporter().parseAsync(root, { binary: true });
    let s = ''; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    // Where the engine puts the wheels (they are hidden in the GLB), for render_car.py's tyre stand-ins (contact shadow, dark arches):
    // [x, y, z, tyre radius, tyre width] in Blender axes (x, -z, y), from the engine's wheel assemblies (tyre 0.35 m x group scale).
    const wheels = e.wheelAssemblies.map((a) => {
      const w = a.group.getWorldPosition(new THREE.Vector3()); const sc = a.group.scale.x;
      return [w.x, -w.z, w.y, 0.35 * sc, (a.isFront ? 0.265 : 0.295) * sc].map((v) => +v.toFixed(4));
    });
    // The same wheels in engine space, keyed as mountFramesCar reads them, and the body's footprint
    const layoutWheels = Object.fromEntries(e.wheelAssemblies.map((a) => {
      const w = a.group.getWorldPosition(new THREE.Vector3());
      return [`${a.isFront ? 'front' : 'rear'}-${a.isRight ? 'right' : 'left'}`, [w.x, w.y, w.z, a.group.scale.x].map((v) => +v.toFixed(4))];
    }));
    const size = new THREE.Box3().setFromObject(e.bodyMeshGroup).getSize(new THREE.Vector3());
    const layout = { wheels: layoutWheels, footprint: [+(size.z / 2).toFixed(3), +(size.x / 2).toFixed(3)] };
    return { b64: btoa(s), wheels, layout };
  }, { ASPECT, VIEWS });
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  fs.writeFileSync(out.replace(/\.glb$/, '') + '.wheels.json', JSON.stringify(wheels));
  fs.writeFileSync(out.replace(/\.glb$/, '') + '.layout.json', JSON.stringify(layout));
  console.log('wrote', out, fs.statSync(out).size);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
