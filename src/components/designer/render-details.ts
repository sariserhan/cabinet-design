import * as THREE from 'three';
import type { Cabinet } from '@/designer/model';
export type DetailBox = (
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  m: THREE.Material,
) => THREE.Mesh;
export function metalPull(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  length: number,
  horizontal: boolean,
  metal: THREE.Material,
) {
  const rail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, length, 12),
    metal,
  );
  if (horizontal) rail.rotation.z = Math.PI / 2;
  rail.position.set(x, y, z);
  rail.castShadow = true;
  group.add(rail);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 1, 10),
      metal,
    );
    post.rotation.x = Math.PI / 2;
    post.position.set(
      x + (horizontal ? side * (length / 2 - 0.6) : 0),
      y + (horizontal ? 0 : side * (length / 2 - 0.6)),
      z - 0.5,
    );
    group.add(post);
  }
}
export function applianceDetails(
  group: THREE.Group,
  item: Cabinet,
  b: DetailBox,
  steel: THREE.Material,
  dark: THREE.Material,
  glass: THREE.Material,
) {
  const { width: w, height: h, depth: d } = item;
  b(w, h, d, 0, h / 2, 0, steel);
  b(w - 1, 2, 0.6, 0, 1, d / 2, dark);
  const face = d / 2 + 0.65;
  if (item.kind === 'refrigerator') {
    if (item.refrigeratorStyle === 'single') {
      b(w - 0.6, h - 2.6, 1, 0, h / 2, face, steel);
      metalPull(
        group,
        (item.mirrored ? 1 : -1) * (w / 2 - 2.5),
        h * 0.6,
        face + 1.1,
        18,
        false,
        steel,
      );
      return;
    }
    if (
      item.refrigeratorStyle === 'double' ||
      item.refrigeratorStyle === 'french'
    ) {
      const bottom = item.refrigeratorStyle === 'french' ? h * 0.28 : 2;
      for (const sign of [-1, 1]) {
        b(
          w / 2 - 0.5,
          h - bottom - 0.5,
          1,
          (sign * w) / 4,
          (h + bottom) / 2,
          face,
          steel,
        );
        metalPull(group, sign * 2, h * 0.65, face + 1.1, 18, false, steel);
      }
      b(0.3, h - bottom, 1.2, 0, (h + bottom) / 2, face, dark);
      if (item.refrigeratorStyle === 'french') {
        b(w - 0.6, bottom - 2.5, 1, 0, bottom / 2, face, steel);
        b(w - 0.6, 0.3, 1.2, 0, bottom, face, dark);
        metalPull(group, 0, bottom - 4, face + 1.1, w - 6, true, steel);
      }
      return;
    }
    // Legacy appliances retain their top-freezer configuration.
    b(w - 0.6, h * 0.27 - 0.35, 1, 0, h * 0.865, face, steel);
    b(w - 0.6, h * 0.73 - 2.6, 1, 0, 1.3 + (h * 0.73 - 2.6) / 2, face, steel);
    b(w - 0.8, 0.25, 1.1, 0, h * 0.73, face, dark);
    metalPull(group, -w / 2 + 2.5, h * 0.83, face + 1.1, 8, false, steel);
    metalPull(group, -w / 2 + 2.5, h * 0.59, face + 1.1, 16, false, steel);
    return;
  }
  if (item.kind === 'dishwasher') {
    b(w - 0.5, h - 3, 0.8, 0, (h + 1) / 2, face, steel);
    b(w - 1, 1.5, 0.3, 0, h - 2, face + 0.5, dark);
    metalPull(group, 0, h - 4, face + 1.3, w - 5, true, steel);
    for (let i = 0; i < 5; i++)
      b(0.25, 0.18, 0.1, -w / 4 + i * 1.2, h - 2, face + 0.7, steel);
    return;
  }
  if (item.kind === 'washing_machine') {
    b(w - 1, 3, 0.6, 0, h - 2, face, steel);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(w * 0.28, 0.65, 12, 48),
      steel,
    );
    rim.position.set(0, h * 0.45, face + 0.5);
    group.add(rim);
    const drum = new THREE.Mesh(new THREE.CircleGeometry(w * 0.27, 48), glass);
    drum.position.set(0, h * 0.45, face + 0.4);
    group.add(drum);
    b(6, 2, 0.4, w / 4, h - 2, face + 0.5, dark);
    return;
  }
  // Range: separate oven glazing, drawer, fascia and cast-iron grates.
  b(w - 2, h * 0.54, 1, 0, h * 0.43, face, dark);
  b(w - 6, h * 0.4, 0.15, 0, h * 0.43, face + 0.6, glass);
  b(w - 1, 4, 0.7, 0, 4, face, steel);
  metalPull(group, 0, h * 0.75, face + 1.2, w - 5, true, steel);
  b(w - 1, 3, 0.8, 0, h - 2, face, steel);
  for (let k = 0; k < 4; k++) {
    const knob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.8, 20),
      steel,
    );
    knob.rotation.x = Math.PI / 2;
    knob.position.set(-w * 0.3 + k * w * 0.2, h - 2, face + 0.8);
    group.add(knob);
    b(0.1, 0.38, 0.12, -w * 0.3 + k * w * 0.2, h - 1.8, face + 1.25, dark);
  }
  b(w - 1, 0.6, d - 1, 0, h + 0.1, 0, dark);
  for (const x of [-w * 0.25, w * 0.25])
    for (const z of [-d * 0.24, d * 0.24]) {
      const burner = new THREE.Mesh(
        new THREE.CylinderGeometry(2.1, 2.1, 0.4, 32),
        steel,
      );
      burner.position.set(x, h + 0.6, z);
      group.add(burner);
      b(8, 0.4, 0.3, x, h + 1, z, dark);
      b(0.3, 0.4, 8, x, h + 1, z, dark);
    }
}
