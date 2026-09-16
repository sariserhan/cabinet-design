'use client';

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applyAssetMaterial, type RenderAssets } from './render-assets';
import { materialTexture, surfaceDetail } from './render-textures';
import type { Design } from '@/designer/model';

/**
 * Adds a rounded box to `parent` and rewrites its UVs so wood grain runs along
 * the longest visible face and tiled surfaces stay aligned in world space.
 */
export const box = (
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  m: THREE.Material,
) => {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(
      Math.max(0.01, w),
      Math.max(0.01, h),
      Math.max(0.01, d),
      2,
      Math.min(
        0.1,
        Math.max(0.01, w) / 5,
        Math.max(0.01, h) / 5,
        Math.max(0.01, d) / 5,
      ),
    ),
    m,
  );
  if (m instanceof THREE.MeshStandardMaterial && m.userData.woodGrain) {
    const uv = mesh.geometry.getAttribute('uv'),
      normal = mesh.geometry.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) {
      const vertical = Math.abs(normal.getY(i)) < 0.5;
      const scaleX = Math.abs(normal.getX(i)) > 0.5 ? d : w;
      const u = uv.getX(i),
        v = uv.getY(i);
      if (vertical && w > h * 3 && h < 4) {
        // Rails and shelf edges run across the cabinet; stiles run upright.
        uv.setXY(
          i,
          (v * h) / (m.userData.textureInches?.[0] ?? 24),
          (u * scaleX) / (m.userData.textureInches?.[1] ?? 36),
        );
      } else
        uv.setXY(
          i,
          (u * scaleX) / (m.userData.textureInches?.[0] ?? 24),
          (v * (vertical ? h : d)) / (m.userData.textureInches?.[1] ?? 36),
        );
    }
  }
  const textureInches = m.userData.textureInches as
    [number, number] | undefined;
  if (textureInches && !m.userData.woodGrain) {
    const uv = mesh.geometry.getAttribute('uv'),
      pos = mesh.geometry.getAttribute('position'),
      normal = mesh.geometry.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(normal.getX(i)),
        ny = Math.abs(normal.getY(i));
      uv.setXY(
        i,
        (nx > 0.7 ? pos.getZ(i) + z : pos.getX(i) + x) / textureInches[0],
        (ny > 0.7 ? pos.getZ(i) + z : pos.getY(i) + y) / textureInches[1],
      );
    }
  }
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

/**
 * Builds every material and texture the scene shares, in one place, so the
 * scene builder receives a finished palette instead of assembling one inline.
 * The returned `materials` and `textures` arrays stay live: callers push
 * anything they create later so a single disposal pass can free all of it.
 */
export function createPalette({
  design,
  assets,
  scanned,
}: {
  design: Design;
  assets: RenderAssets | null;
  scanned: boolean;
}) {
  const textures = [
    materialTexture('wood'),
    materialTexture(design.appearance?.countertop ?? 'quartz'),
    materialTexture(
      design.appearance?.flooring === 'walnut'
        ? 'walnut'
        : design.appearance?.flooring === 'tile'
          ? 'tile'
          : design.appearance?.flooring === 'slate'
            ? 'slate'
            : 'floor',
    ),
  ];

  const detailMaps = {
    paint: surfaceDetail('paint'),
    wood: surfaceDetail('wood'),
    stone: surfaceDetail('stone'),
    metal: surfaceDetail('metal'),
  };
  textures.push(...Object.values(detailMaps));
  const materials: THREE.Material[] = [];
  const material = (color: string, metalness = 0, roughness = 0.65) => {
    const m = new THREE.MeshPhysicalMaterial({ color, metalness, roughness });
    materials.push(m);
    return m;
  };
  const finishMaterials = new Map<
    string,
    { finish: THREE.MeshStandardMaterial; inset: THREE.MeshStandardMaterial }
  >();
  const finishFor = (name: Design['finish']) => {
    const cached = finishMaterials.get(name);
    if (cached) return cached;
    const finish = material(
      { linen: '#ece7dc', oak: '#ffffff', slate: '#414d57' }[name],
    );
    const inset = material(
      { linen: '#ece7dc', oak: '#ffffff', slate: '#414d57' }[name],
    );
    for (const surface of [finish, inset]) {
      surface.roughness = name === 'oak' ? 0.48 : 0.36;
      surface.clearcoat = name === 'oak' ? 0.18 : 0.3;
      surface.clearcoatRoughness = 0.32;
      surface.roughnessMap = detailMaps[name === 'oak' ? 'wood' : 'paint'];
      surface.bumpMap = surface.roughnessMap;
      surface.bumpScale = name === 'oak' ? 0.025 : 0.006;
    }
    if (name === 'oak') {
      finish.map = textures[0] ?? null;
      inset.map = textures[0] ?? null;
      for (const m of [finish, inset]) {
        m.userData.woodGrain = true;
        if (assets && scanned) applyAssetMaterial(m, assets.wood, textures);
      }
    }
    const pair = { finish, inset };
    finishMaterials.set(name, pair);
    return pair;
  };
  const stoneMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const stoneFor = (name: 'quartz' | 'marble' | 'granite') => {
    const cached = stoneMaterials.get(name);
    if (cached) return cached;
    const m = material('#ffffff', 0, 0.23);
    m.clearcoat = 0.45;
    m.clearcoatRoughness = 0.16;
    const texture = materialTexture(name);
    textures.push(texture);
    m.map = texture;
    m.userData.textureInches = [72, 36];
    m.bumpMap = detailMaps.stone;
    m.roughnessMap = detailMaps.stone;
    m.bumpScale = name === 'granite' ? 0.035 : 0.012;
    m.roughness = name === 'granite' ? 0.32 : 0.2;
    if (name === 'marble' && assets && scanned)
      applyAssetMaterial(m, assets.stone, textures);
    stoneMaterials.set(name, m);
    return m;
  };
  const steel = material('#a9b0b3', 0.75, 0.25),
    dark = material('#20282d', 0.25, 0.26),
    wall = material('#f4f0e8'),
    glass = material('#203138', 0.48, 0.12);
  const hardware = material(
    design.appearance?.hardware === 'brass'
      ? '#b99a5e'
      : design.appearance?.hardware === 'black'
        ? '#24282a'
        : '#b9c0c3',
    0.8,
    0.28,
  );
  const windowGlass = new THREE.MeshPhysicalMaterial({
    color: '#d5e8e9',
    roughness: 0.06,
    transmission: 0.78,
    thickness: 0.4,
    ior: 1.5,
    envMapIntensity: 1.2,
  });
  materials.push(windowGlass);
  const brushed = materialTexture('metal');
  textures.push(brushed);
  steel.color.set('#ffffff');
  steel.map = brushed;
  steel.bumpMap = detailMaps.metal;
  steel.roughnessMap = detailMaps.metal;
  steel.metalness = 0.95;
  steel.roughness = 0.32;
  steel.bumpScale = 0.008;
  const floorMaterial = material('#ffffff', 0, 0.52);
  const woodFloor = !['tile', 'slate'].includes(
    design.appearance?.flooring ?? 'oak',
  );
  floorMaterial.roughnessMap = woodFloor ? detailMaps.wood : detailMaps.stone;
  floorMaterial.bumpMap = floorMaterial.roughnessMap;
  floorMaterial.bumpScale = 0.035;
  floorMaterial.clearcoat = woodFloor ? 0.15 : 0.05;
  floorMaterial.clearcoatRoughness = 0.4;
  floorMaterial.map = textures[2] ?? null;
  if (assets && scanned) {
    if (design.appearance?.flooring === 'tile')
      applyAssetMaterial(floorMaterial, assets.tile, textures);
    else if (woodFloor)
      applyAssetMaterial(
        floorMaterial,
        design.appearance?.flooring === 'walnut' ? assets.grain : assets.wood,
        textures,
      );
  }

  return {
    textures,
    stoneMaterials,
    detailMaps,
    materials,
    material,
    finishFor,
    stoneFor,
    steel,
    dark,
    wall,
    glass,
    hardware,
    windowGlass,
    floorMaterial,
  };
}
