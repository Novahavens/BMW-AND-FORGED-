/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * A car-photography studio as a reflection environment: a dark room with large light panels
 * (a big overhead softbox, long strip lights along each side, soft kickers front and back).
 *
 * Car paint is a mirror under its clear coat, so what makes it read as "studio photo" is the
 * shape of the lights reflected in it: long, clean, soft-edged highlights running along the
 * bonnet, roof and doors, with dark between them so the colour shows. A small round-light HDRI
 * gives blotchy spots instead. The panels are generated in code (no downloads, no licence).
 *
 * Coordinates are car-relative: the car sits at the origin, nose towards +Z, wheels on y = 0.
 */
export function buildSoftboxStudio(): THREE.Scene {
  const scene = new THREE.Scene();

  // Room: near-black, a touch lighter at the horizon so the lower body and sills catch a
  // faint line instead of disappearing.
  const room = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32), roomMaterial());
  scene.add(room);

  // Overhead softbox: a big diffuser with a slightly hotter centre and feathered edges, so the
  // bonnet and roof carry a soft-edged gradient rather than a hard white patch.
  panel(scene, { w: 4.6, h: 8.5, at: [0, 6.6, 0.3], lookAt: [0, 0, 0.3], intensity: 2.3, feather: 0.32 });

  // Long side strips: the line highlight along the doors and shoulder line
  for (const side of [-1, 1]) {
    panel(scene, { w: 11, h: 0.9, at: [side * 6.5, 2.2, 0], lookAt: [0, 1.1, 0], intensity: 2.4, feather: 0.18 });
    panel(scene, { w: 11, h: 0.5, at: [side * 6.5, 4.4, 0], lookAt: [0, 1.0, 0], intensity: 1.0, feather: 0.25 });
    // Low strip: doors and sills reflect the opposite low side of the studio from a raised camera
    panel(scene, { w: 12, h: 1.2, at: [side * 7, 0.7, 0], lookAt: [0, 0.6, 0], intensity: 1.3, feather: 0.3 });
  }

  // Front and rear kickers: soft fill for the grille, lights and rear diffuser
  panel(scene, { w: 5, h: 2.2, at: [0, 2.0, 9], lookAt: [0, 0.8, 0], intensity: 1.0, feather: 0.35 });
  panel(scene, { w: 5, h: 2.2, at: [0, 2.0, -9], lookAt: [0, 0.8, 0], intensity: 0.8, feather: 0.35 });

  // Three-quarter accent, top front left (where the hero camera usually sits)
  panel(scene, { w: 2.4, h: 2.4, at: [-5.5, 5.5, 6], lookAt: [0, 0.8, 0], intensity: 1.4, feather: 0.4 });

  // Floor bounce: a dim warm-grey panel under the car, so tyres and lower sills pick up the
  // faint lift a real studio floor gives (otherwise rubber reads pure black)
  panel(scene, { w: 9, h: 9, at: [0, -0.4, 0], lookAt: [0, 1, 0], intensity: 0.08, feather: 0.45 });

  // Floor: dark satin, catching just a little light under the car
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(20, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.018, 0.018, 0.02), toneMapped: false })
  );
  floor.position.y = -0.01;
  scene.add(floor);
  return scene;
}

function panel(
  scene: THREE.Scene,
  o: { w: number; h: number; at: [number, number, number]; lookAt: [number, number, number]; intensity: number; feather?: number }
) {
  // A diffuser, not a flat card: brighter in the middle, edges feathered to nothing (added on
  // top of the dark room, so a soft edge never shows a seam).
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(1, 0.995, 0.985).multiplyScalar(o.intensity) },
      uFeather: { value: o.feather ?? 0.2 }
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uFeather; varying vec2 vUv;
void main() {
  vec2 d = min(vUv, 1.0 - vUv);
  float edge = smoothstep(0.0, uFeather * 0.5, d.x) * smoothstep(0.0, uFeather * 0.5, d.y);
  vec2 c = vUv - 0.5;
  float hot = 0.82 + 0.18 * (1.0 - smoothstep(0.0, 0.5, length(c)));
  gl_FragColor = vec4(uColor * edge * hot, 1.0);
}`,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), mat);
  mesh.position.set(...o.at);
  mesh.lookAt(...o.lookAt);
  mesh.renderOrder = 1;
  scene.add(mesh);
}

function roomMaterial() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDir;
void main() {
  float y = vDir.y;
  float horizon = exp(-abs(y) * 9.0);
  vec3 c = vec3(0.035) + vec3(0.14) * horizon + vec3(0.03) * max(y, 0.0);
  gl_FragColor = vec4(c, 1.0);
}`
  });
  return mat;
}
