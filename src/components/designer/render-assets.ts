import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export type AssetMaterial = {
  color: THREE.Texture;
  rough: THREE.Texture;
  normal: THREE.Texture;
  inches: [number, number];
};
export type RenderAssets = {
  wood: AssetMaterial;
  grain: AssetMaterial;
  stone: AssetMaterial;
  tile: AssetMaterial;
  sky: THREE.DataTexture;
  stool: THREE.Group;
};
let pending: Promise<RenderAssets> | undefined;
export function loadRenderAssets() {
  if (!pending)
    pending = (async () => {
      const loader = new THREE.TextureLoader();
      async function material(
        key: string,
        inches: [number, number],
        stone = false,
      ): Promise<AssetMaterial> {
        const [color, rough, normal] = await Promise.all([
          loader.loadAsync(
            `/render-assets/${key}-${stone ? 'color' : 'diffuse'}.jpg`,
          ),
          loader.loadAsync(`/render-assets/${key}-rough.jpg`),
          loader.loadAsync(
            `/render-assets/${key}-${stone ? 'normal' : 'nor_gl'}.jpg`,
          ),
        ]);
        color.colorSpace = THREE.SRGBColorSpace;
        for (const t of [color, rough, normal]) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = 4;
        }
        return { color, rough, normal, inches };
      }
      const [wood, grain, stone, tile, sky, stool] = await Promise.all([
        material('wood', [23.622, 23.622]),
        material('grain', [23.622, 23.622]),
        material('stone', [48, 48], true),
        material('tile', [74.803, 74.803]),
        new HDRLoader().loadAsync('/render-assets/sky-hdri.hdr'),
        new GLTFLoader().loadAsync('/render-assets/stool/stool.gltf'),
      ]);
      sky.mapping = THREE.EquirectangularReflectionMapping;
      return { wood, grain, stone, tile, sky, stool: stool.scene };
    })().catch((e) => {
      pending = undefined;
      throw e;
    });
  return pending;
}
export function applyAssetMaterial(
  m: THREE.MeshStandardMaterial,
  asset: AssetMaterial,
  textures: THREE.Texture[],
) {
  const [color, rough, normal] = [asset.color, asset.rough, asset.normal].map(
    (t) => t.clone(),
  );
  if (!color || !rough || !normal) return;
  textures.push(color, rough, normal);
  m.map = color;
  m.roughnessMap = rough;
  m.normalMap = normal;
  m.bumpMap = null;
  m.color.set('#ffffff');
  m.userData.textureInches = asset.inches;
}
