import * as THREE from 'three';
/** Dimensioned generic fixtures; no manufacturer geometry is implied. */
export function faucetDetails(
  parent: THREE.Group,
  height: number,
  depth: number,
  metal: THREE.Material,
) {
  const z = -depth / 2 + 2;
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, height, z),
        new THREE.Vector3(0, height + 9, z),
        new THREE.Vector3(0, height + 13, z + 2),
        new THREE.Vector3(0, height + 12, z + 7),
        new THREE.Vector3(0, height + 9, z + 8),
      ]),
      40,
      0.48,
      12,
      false,
    ),
    metal,
  );
  parent.add(tube);
  tube.castShadow = true;
  for (const [r, h, x, y, zz] of [
    [1.25, 0.35, 0, height, z],
    [0.7, 2, 0, height + 8.5, z + 8],
    [0.3, 3, 1.7, height + 2, z],
  ] as const) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), metal);
    m.position.set(x, y, zz);
    m.castShadow = true;
    parent.add(m);
  }
}
export function drainDetails(
  parent: THREE.Group,
  x: number,
  metal: THREE.Material,
) {
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.12, 8, 24), metal);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, 1.72, 0);
  parent.add(rim);
  for (let i = -2; i <= 2; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.06, 1.5 - Math.abs(i) * 0.2),
      metal,
    );
    m.position.set(x + i * 0.3, 1.72, 0);
    parent.add(m);
  }
}
export function cloneDecorativeModel(
  source: THREE.Group,
  materials: THREE.Material[],
  textures: THREE.Texture[],
) {
  const model = source.clone(true);
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry = o.geometry.clone();
      o.castShadow = true;
      o.receiveShadow = true;
      const clone = (m: THREE.Material) => {
        const copy = m.clone();
        materials.push(copy);
        const record = copy as unknown as Record<string, unknown>;
        for (const k of Object.keys(record)) {
          const t = record[k];
          if (t instanceof THREE.Texture) {
            record[k] = t.clone();
            textures.push(record[k] as THREE.Texture);
          }
        }
        return copy;
      };
      o.material = Array.isArray(o.material)
        ? o.material.map(clone)
        : clone(o.material);
    }
  });
  const bounds = new THREE.Box3().setFromObject(model),
    size = bounds.getSize(new THREE.Vector3());
  model.scale.setScalar(26 / Math.max(0.001, size.y));
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(
    -center.x * model.scale.x,
    -bounds.min.y * model.scale.y,
    -center.z * model.scale.z,
  );
  return model;
}
