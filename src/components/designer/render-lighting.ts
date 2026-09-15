import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { localToWorld, type Design } from '@/designer/model';

/** Broad window emitters supplement the sun; the final renderer traces their bounce. */
export function addWindowLighting(
  scene: THREE.Scene,
  design: Design,
  sun: THREE.DirectionalLight,
) {
  RectAreaLightUniformsLib.init();
  const windows = design.items
    .filter((i) => i.kind === 'window' && !i.opening)
    .slice(0, 8);
  const task = design.appearance?.lightingProfile === 'task';
  const evening = design.appearance?.lightingProfile === 'evening';
  for (const [index, window] of windows.entries()) {
    const center = localToWorld(window, window.width / 2, window.depth / 2);
    const front = localToWorld(window, window.width / 2, window.depth / 2 + 1);
    const inward = new THREE.Vector3(front.x - center.x, 0, front.y - center.y);
    const roomDirection = new THREE.Vector3(
      design.room.width / 2 - center.x,
      0,
      design.room.depth / 2 - center.y,
    );
    if (inward.dot(roomDirection) < 0) inward.negate();
    const position = new THREE.Vector3(
      center.x,
      window.elevation + window.height / 2,
      center.y,
    );
    const light = new THREE.RectAreaLight(
      design.appearance?.lighting === 'warm' ? '#ffd5a0' : '#e8f1ff',
      task ? 0.15 : evening ? 0.4 : 2.5,
      Math.max(1, window.width - 4),
      Math.max(1, window.height - 4),
    );
    light.position
      .copy(position)
      .addScaledVector(inward, window.depth / 2 + 0.6);
    light.lookAt(position.clone().addScaledVector(inward, 80));
    scene.add(light);
    if (index === 0 && !task && design.appearance?.lighting !== 'studio') {
      sun.position
        .copy(position)
        .addScaledVector(inward, -120)
        .add(new THREE.Vector3(0, 65, 0));
      sun.target.position
        .copy(position)
        .addScaledVector(inward, 100)
        .add(new THREE.Vector3(0, -45, 0));
      sun.intensity = evening
        ? 0.35
        : design.appearance?.lighting === 'warm'
          ? 1.2
          : 2;
    }
  }
}
