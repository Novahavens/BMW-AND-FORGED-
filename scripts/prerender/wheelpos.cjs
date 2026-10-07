/**
 * Prints (and writes) where the live engine puts a car's four wheels, as [x, y, z, tyre radius, tyre width] in Blender axes.
 * export-scene.cjs already writes the same file next to the GLB (<glb>.wheels.json); use this for a GLB that was exported earlier.
 *
 *   bunx vite --host 127.0.0.1 --port 5173      # dev server, in another shell
 *   node scripts/prerender/wheelpos.cjs <carIndex> <out.wheels.json>
 */
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [,, carIdx, out] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  await p.goto(`http://127.0.0.1:5173/scripts/render/engine.html?car=${carIdx}`);
  await p.waitForFunction(() => window.done !== undefined, null, { timeout: 300000 });
  const wheels = await p.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    return window.e.wheelAssemblies.map((a) => {
      const w = a.group.getWorldPosition(new THREE.Vector3()); const sc = a.group.scale.x;
      return [w.x, -w.z, w.y, 0.35 * sc, (a.isFront ? 0.265 : 0.295) * sc].map((v) => +v.toFixed(4));
    });
  });
  console.log(JSON.stringify(wheels));
  if (out) fs.writeFileSync(out, JSON.stringify(wheels));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
