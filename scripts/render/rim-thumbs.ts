/**
 * Harness page for scripts/render/rim-thumbs.cjs: the shared wheel viewer (the rim page's 3D studio) on a
 * transparent page, face-on, not turning, with the configurator's finish recipe. ?wheel=<id>&finish=<id>.
 */
import React from 'react';
import * as THREE from 'three';
import { createRoot } from 'react-dom/client';
import { WheelStudio } from '../../shared/wheel-viewer';
import { configuratorPaint } from '../../services/wheelViewerPaint';
import { STATIC_CATALOG } from '../../services/catalogService';
import { WHEEL_DESIGNS } from '../../data/configuratorData';

// No floor shadow: the thumbnail is a cut-out laid on the card. Material's constructor assigns visible, which
// lands on this setter and is ignored.
Object.defineProperty(THREE.ShadowMaterial.prototype, 'visible', { get: () => false, set: () => {} });

const q = new URLSearchParams(location.search);
const wheel = WHEEL_DESIGNS.find((w) => w.id === q.get('wheel'));
const f = wheel && STATIC_CATALOG.finishes[q.get('finish') || wheel.defaultVariant];
if (!wheel?.modelUrl || !f) {
  // the driver waits for a canvas, so it times out and reports this shot as failed
  document.body.textContent = `rim-thumbs: unknown wheel "${q.get('wheel')}", no model file, or unknown finish "${q.get('finish')}"`;
  throw new Error(document.body.textContent);
}
const finish = {
  id: f.id,
  name: f.name,
  swatchHex: f.hex,
  // ?hex= &metal= &rough= &coat= try other values for the finish (comparison renders only)
  paint: {
    hex: q.get('hex') ? `#${q.get('hex')}` : f.hex,
    metalness: q.has('metal') ? +q.get('metal')! : f.metalness,
    roughness: q.has('rough') ? +q.get('rough')! : f.roughness,
    clearcoat: q.has('coat') ? +q.get('coat')! : f.clearcoat,
  },
};
// The viewer reports loading through its spinner; the harness waits for the canvas and a quiet second.
createRoot(document.getElementById('root')!).render(
  React.createElement(WheelStudio, {
    wheelModel: wheel.name,
    finishes: [finish],
    selectedFinish: finish,
    onSelectFinish: () => {},
    modelUrl: wheel.modelUrl,
    modelFlip: !!wheel.modelFlip,
    initialView: 'face',
    initialToggles: { orbit: false, spin: false },
    paint: configuratorPaint,
    className: 'thumb-stage',
  })
);
