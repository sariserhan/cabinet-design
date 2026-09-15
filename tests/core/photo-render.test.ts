import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  photoSnapshot,
  renderPhoto,
} from '../../src/components/designer/photo-render';
import { presentationViews } from '../../src/designer/render-planning';
import { newDesign } from '../../src/designer/model';

test('photo snapshots isolate resources and omit hidden geometry and selection helpers', () => {
  const scene = new THREE.Scene();
  const texture = new THREE.Texture();
  const material = new THREE.MeshPhysicalMaterial({
    map: texture,
    envMap: texture,
  });
  const geometry = new THREE.BoxGeometry(2, 3, 4);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh, new THREE.BoxHelper(mesh));
  const hidden = new THREE.Group();
  hidden.visible = false;
  hidden.add(new THREE.Mesh(geometry, material));
  scene.add(hidden);
  const snapshot = photoSnapshot(scene);
  assert.equal(snapshot.scene.children.length, 1);
  const copy = snapshot.scene.children[0];
  assert.ok(copy instanceof THREE.Mesh);
  assert.notEqual(copy.geometry, geometry);
  assert.notEqual(copy.material, material);
  assert.notEqual(copy.material.map, texture);
  assert.equal(copy.material.envMap, null);
  material.color.set('#ff0000');
  mesh.position.x = 99;
  assert.equal(copy.material.color.getHex(), 0xffffff);
  assert.equal(copy.position.x, 0);
  let sourceDisposed = false;
  geometry.addEventListener('dispose', () => {
    sourceDisposed = true;
  });
  snapshot.dispose();
  assert.equal(sourceDisposed, false);
  geometry.dispose();
  material.dispose();
  texture.dispose();
});
test('cancellation disposes a photo snapshot before loading the GPU renderer', async () => {
  const scene = new THREE.Scene();
  scene.add(
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()),
  );
  const snapshot = photoSnapshot(scene),
    controller = new AbortController();
  let disposed = false;
  const originalDispose = snapshot.dispose;
  snapshot.dispose = () => {
    disposed = true;
    originalDispose();
  };
  controller.abort();
  await assert.rejects(
    renderPhoto(snapshot, new THREE.PerspectiveCamera(), {
      width: 640,
      samples: 8,
      exposure: 1,
      signal: controller.signal,
      onProgress: () => {},
    }),
    { name: 'AbortError' },
  );
  assert.equal(disposed, true);
});
test('level interior camera has horizontal sightline and a valid standing position', () => {
  const d = newDesign();
  d.items = [];
  const view = presentationViews(d).find((v) => v.id === 'preset-level');
  assert.ok(view);
  assert.equal(view.position[1], view.target[1]);
  assert.ok(view.position[0] > 0 && view.position[0] < d.room.width);
  assert.ok(view.position[2] > 0 && view.position[2] < d.room.depth);
});
