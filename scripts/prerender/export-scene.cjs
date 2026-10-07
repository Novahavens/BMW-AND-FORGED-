/**
 * Exports a car exactly as the engine places it (body only, stock wheels already hidden), plus
 * one camera per configurator view at the fixed stage aspect, to a GLB for Blender.
 *
 *   bunx vite --host 127.0.0.1 --port 5173      # dev server, in another shell
 *   node scripts/prerender/export-scene.cjs <carIndex> <out.glb>
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [,, carIdx, out] = process.argv;
const ASPECT = 1.6; // must match RENDER_ASPECT in components/journey/RenderedCarView.tsx
const VIEWS = ['frontThreeQuarter', 'side', 'rearThreeQuarter', 'frontWheel', 'top'];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', (e) => console.error('pageerror', e.message));
  await p.goto(`http://127.0.0.1:5173/scripts/render/engine.html?car=${carIdx}`);
  await p.waitForFunction(() => window.done !== undefined, null, { timeout: 300000 });
  const { b64, wheels } = await p.evaluate(async ({ ASPECT, VIEWS }) => {
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
        s.name = paint ? 'PAINT' : (x.userData?.partKind || x.name || 'part');
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
    return { b64: btoa(s), wheels };
  }, { ASPECT, VIEWS });
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  fs.writeFileSync(out.replace(/\.glb$/, '') + '.wheels.json', JSON.stringify(wheels));
  console.log('wrote', out, fs.statSync(out).size);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
