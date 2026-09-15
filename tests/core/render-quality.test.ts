import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { imageBalance, noisyRegions } from '../../src/designer/image-quality';
import {
  defaultRenderSettings,
  emptyPresentationScenes,
  parsePresentationScenes,
} from '../../src/designer/render-settings';
import {
  collectProjectBackup,
  restoreProjectCopy,
} from '../../src/designer/project-backup';
import { newDesign } from '../../src/designer/model';
function pixels(r: number, g = r, b = r) {
  return new Uint8ClampedArray(
    Array.from({ length: 64 }, () => [r, g, b, 255]).flat(),
  );
}
test('image balance lifts dark midtones, protects bright views and neutralizes a mild cast', () => {
  assert.ok(imageBalance(pixels(50)).exposure > 1);
  assert.ok(imageBalance(pixels(220)).exposure < 1);
  const warm = imageBalance(pixels(150, 140, 130));
  assert.ok(warm.whiteBalance[0] < 1);
  assert.ok(warm.whiteBalance[2] > 1);
  assert.deepEqual(imageBalance(pixels(0)), {
    exposure: 1,
    whiteBalance: [1, 1, 1],
  });
  assert.deepEqual(imageBalance(pixels(255)), {
    exposure: 1,
    whiteBalance: [1, 1, 1],
  });
  assert.deepEqual(imageBalance(pixels(190, 70, 30)).whiteBalance, [1, 1, 1]);
});
test('regional refinement detects changing samples rather than stable texture contrast', () => {
  const before = pixels(100),
    after = pixels(100);
  for (let y = 0; y < 4; y++)
    for (let x = 4; x < 8; x++) after[(y * 8 + x) * 4] = 150;
  assert.deepEqual(
    noisyRegions(before, after, 8, 8).map((v) => v.index),
    [1],
  );
  assert.deepEqual(noisyRegions(after, after, 8, 8), []);
});
const scene = {
  id: 'view',
  name: 'Daylight',
  position: [100, 60, 150],
  target: [100, 60, 0],
  settings: defaultRenderSettings,
};
test('scene import rejects duplicate IDs, wrong project, excessive scenes and invalid settings', () => {
  const set = { ...emptyPresentationScenes('design'), scenes: [scene] };
  assert.equal(
    parsePresentationScenes(JSON.stringify(set), 'design').scenes.length,
    1,
  );
  assert.throws(() => parsePresentationScenes(JSON.stringify(set), 'another'));
  assert.throws(() =>
    parsePresentationScenes(
      JSON.stringify({ ...set, scenes: [scene, scene] }),
      'design',
    ),
  );
  assert.throws(() =>
    parsePresentationScenes(
      JSON.stringify({
        ...set,
        scenes: Array.from({ length: 7 }, (_, i) => ({
          ...scene,
          id: String(i),
        })),
      }),
      'design',
    ),
  );
  assert.throws(() =>
    parsePresentationScenes(
      JSON.stringify({
        ...set,
        scenes: [{ ...scene, settings: { ...defaultRenderSettings, lens: 0 } }],
      }),
      'design',
    ),
  );
  assert.throws(() => parsePresentationScenes(' '.repeat(50001), 'design'));
  assert.throws(() =>
    parsePresentationScenes(
      JSON.stringify({
        ...set,
        scenes: [{ ...scene, target: scene.position }],
      }),
      'design',
    ),
  );
  const {
    lightingProfile: _profile,
    interiors: _interiors,
    opening: _opening,
    ...legacySettings
  } = defaultRenderSettings;
  assert.equal(_profile, 'day');
  assert.equal(_interiors, false);
  assert.equal(_opening, 0);
  const legacy = parsePresentationScenes(
    JSON.stringify({
      ...set,
      scenes: [{ ...scene, settings: legacySettings }],
    }),
    'design',
  );
  assert.equal(legacy.scenes[0]?.settings.lightingProfile, 'day');
  assert.equal(legacy.scenes[0]?.settings.opening, 0);
});
test('complete backups carry scenes and remap ownership to the restored design', () => {
  const design = newDesign();
  const set = { ...emptyPresentationScenes(design.id), scenes: [scene] };
  const storage = {
    getItem: (key: string) =>
      key === `kitchen-scenes:owner:${design.id}` ? JSON.stringify(set) : null,
  };
  const backup = collectProjectBackup(storage, 'owner', design);
  assert.equal(backup.presentationScenes?.scenes.length, 1);
  const copy = restoreProjectCopy(backup, 'copy');
  assert.equal(copy.presentationScenes?.designId, 'copy');
  assert.deepEqual(
    copy.presentationScenes?.scenes,
    backup.presentationScenes?.scenes,
  );
});
test('bundled render assets match their provenance manifest', () => {
  const manifest = JSON.parse(
    readFileSync('public/render-assets/manifest.json', 'utf8'),
  ) as { file: string; sha256: string; license: string; bytes: number }[];
  assert.ok(manifest.length >= 15);
  for (const asset of manifest) {
    const bytes = readFileSync(`public/render-assets/${asset.file}`);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      asset.sha256,
    );
    assert.equal(asset.license, 'CC0-1.0');
  }
  const gltf = JSON.parse(
    readFileSync('public/render-assets/stool/stool.gltf', 'utf8'),
  );
  for (const entry of [...gltf.buffers, ...gltf.images])
    assert.ok(
      readFileSync(`public/render-assets/stool/${entry.uri}`).length > 0,
    );
});

test('fixture geometry adds a curved spout and strainer without changing cabinet dimensions', async () => {
  const THREE = await import('three');
  const { faucetDetails, drainDetails, cloneDecorativeModel } =
    await import('../../src/components/designer/render-fixtures');
  const metal = new THREE.MeshStandardMaterial();
  const group = new THREE.Group();
  faucetDetails(group, 9, 24, metal);
  drainDetails(group, 0, metal);
  assert.ok(
    group.children.some(
      (child) =>
        child instanceof THREE.Mesh &&
        child.geometry instanceof THREE.TubeGeometry,
    ),
  );
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.max.y > 20 && bounds.max.y < 25);
  const original = new THREE.Group();
  original.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), metal));
  const materials: import('three').Material[] = [],
    textures: import('three').Texture[] = [];
  const cloned = cloneDecorativeModel(original, materials, textures);
  assert.equal(
    Math.round(
      new THREE.Box3().setFromObject(cloned).getSize(new THREE.Vector3()).y,
    ),
    26,
  );
  assert.equal(
    new THREE.Box3().setFromObject(original).getSize(new THREE.Vector3()).y,
    2,
  );
  assert.notEqual(materials[0], metal);
});
