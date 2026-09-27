import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
for (const m of root.listMaterials()) console.log('MAT', m.getName(), m.getAlphaMode(), m.getBaseColorFactor().map(x=>x.toFixed(3)).join(','), m.getEmissiveFactor().join(','), m.listExtensions().map(e=>e.extensionName), m.getDoubleSided());
const rn = root.listNodes().find(n=>n.getName()==='RootNode');
for (const c of rn.listChildren()) {
  const out=[];
  c.traverse(n=>{ const m=n.getMesh(); if(!m) return; for(const p of m.listPrimitives()) out.push(n.getName().replace(c.getName()+'_','').replace(/x5mf95racing_/g,'')+'=>'+p.getMaterial()?.getName().replace('x5mf95racing_','')+':'+(p.getIndices()?.getCount()/3)); if (n!==c && n.listChildren().length) out.push('(has children)'); });
  const t=c.getTranslation(), r=c.getRotation(), s=c.getScale();
  console.log(c.getName().replace('x5mf95racing_',''), 'T', t.map(x=>x.toFixed(1)).join(','), 'R', r.map(x=>x.toFixed(2)).join(','), 'S', s.map(x=>x.toFixed(2)).join(','), c.listChildren().length, '|', out.join('  '));
}
