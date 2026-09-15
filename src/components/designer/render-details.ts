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
    const mount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.12, 16),
      metal,
    );
    mount.rotation.x = Math.PI / 2;
    mount.position.copy(post.position);
    mount.position.z -= 0.46;
    group.add(mount);
  }
}
export function applianceDetails(
  group: THREE.Group,
  item: Cabinet,
  b: DetailBox,
  steel: THREE.Material,
  dark: THREE.Material,
  glass: THREE.Material,
  register?: (apply: (amount: number) => void) => void,
) {
  const { width: w, height: h, depth: d } = item;
  const face = d / 2 - 0.1;
  if (item.kind === 'refrigerator') {
    // Open carcass with shelves, so doors reveal an interior rather than a solid block.
    b(w, h, 1, 0, h / 2, -d / 2, steel);
    for (const x of [-w / 2 + 0.5, w / 2 - 0.5]) b(1, h, d, x, h / 2, 0, steel);
    for (const y of [1, h - 1]) b(w, 1, d, 0, y, 0, steel);
    for (const y of [h * 0.25, h * 0.48, h * 0.7])
      b(w - 3, 0.5, d - 4, 0, y, -1, steel);
    const door = (
      x: number,
      y: number,
      width: number,
      height: number,
      right: boolean,
      drawer = false,
    ) => {
      const start = group.children.length;
      b(width - 0.15, height - 0.15, 0.25, x, y, face - 0.62, dark);
      b(width, height, 1, x, y, face, steel);
      if (!drawer && height > 35 && width > 15) {
        b(3.5, 5, 0.12, x, y + height * 0.16, face + 0.55, glass);
        b(2, 0.12, 0.15, x, y + height * 0.16 + 1, face + 0.65, steel);
      }
      metalPull(
        group,
        drawer ? x : x + (right ? -1 : 1) * (width / 2 - 2),
        drawer ? y + height / 2 - 3 : y,
        face + 1.1,
        drawer ? width - 5 : Math.min(18, height - 4),
        drawer,
        steel,
      );
      const parts = group.children.slice(start),
        pivot = new THREE.Group();
      if (!drawer)
        pivot.position.set(x + (right ? width / 2 : -width / 2), 0, face);
      group.add(pivot);
      for (const part of parts) pivot.attach(part);
      register?.((amount) => {
        if (drawer) pivot.position.z = amount * (d - 4) * 0.75;
        else pivot.rotation.y = (right ? 1 : -1) * amount * Math.PI * 0.5;
      });
    };
    if (item.refrigeratorStyle === 'single')
      door(0, h / 2, w - 0.6, h - 2.6, !item.mirrored);
    else if (
      item.refrigeratorStyle === 'double' ||
      item.refrigeratorStyle === 'french'
    ) {
      const bottom = item.refrigeratorStyle === 'french' ? h * 0.28 : 2;
      for (const sign of [-1, 1])
        door(
          (sign * w) / 4,
          (h + bottom) / 2,
          w / 2 - 0.5,
          h - bottom - 0.5,
          sign === 1,
        );
      if (item.refrigeratorStyle === 'french')
        door(0, bottom / 2, w - 0.6, bottom - 2.5, false, true);
    } else {
      door(0, h * 0.865, w - 0.6, h * 0.27 - 0.35, !item.mirrored);
      door(
        0,
        1.3 + (h * 0.73 - 2.6) / 2,
        w - 0.6,
        h * 0.73 - 2.6,
        !item.mirrored,
      );
    }
    return;
  }
  b(w, h, Math.max(1, d - 1), 0, h / 2, -0.5, dark);
  b(w - 1, 2, 0.6, 0, 1, d / 2, dark);
  for (let x = -w / 2 + 2; x < w / 2 - 1; x += 2)
    b(0.75, 1, 0.15, x, 1, d / 2 + 0.1, steel);
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
