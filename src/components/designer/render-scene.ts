'use client';

import * as THREE from 'three';
import { type RenderAssets } from './render-assets';
import {
  faucetDetails,
  drainDetails,
  cloneDecorativeModel,
} from './render-fixtures';
import { applianceDetails, doorFace, metalPull } from './render-details';
import { materialTexture } from './render-textures';
import { box, createPalette } from './render-materials';
import { backsplashRuns, walkEntry } from '@/designer/render-planning';
import { apronHeight } from '@/designer/refinements';
import type { RenderSettings } from '@/designer/render-settings';
import type { Design } from '@/designer/model';
import {
  itemPolygon,
  isUpperCabinet,
  localToWorld,
  worldToLocal,
  containsFootprint,
  cutPanels,
  FRONT_DETAIL_BUDGET,
  footprint,
  resolvedFront,
  sinkHoles,
  wallPanels,
  partitionPanels,
} from '@/designer/model';
import {
  rectangleInside,
  inside,
  wallSegments,
  roomOutline,
  ceilingAt,
  ceilingRegions,
} from '@/designer/room';

/**
 * Builds every mesh in the kitchen from the design: floor, walls and openings,
 * cabinets and their fronts, worktops, appliances, fixtures and backsplashes.
 *
 * Pulled out of RenderView so the component keeps only the renderer lifecycle,
 * the camera and the input handling. It returns the collections the rest of the
 * effect needs: the wall groups it toggles for cutaway, the item groups and
 * surfaces it raycasts against, and the reflection target it disposes.
 */
type Palette = ReturnType<typeof createPalette>;

/** Everything the builder needs from the renderer lifecycle it does not own. */
export type BuildContext = Palette & {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  design: Design;
  settings: RenderSettings;
  /** Longest room dimension, used to scale lights and helper geometry. */
  size: number;
  assets: RenderAssets | null;
  interiors: boolean;
  showCeiling: boolean;
  quality: boolean;
  selected?: string | null | undefined;
  selectedIds?: string[] | undefined;
  /** Read at build time and again per frame, so it stays a ref. */
  openingRef: { current: number };
};

/**
 * Did the room probe actually capture the room?
 *
 * A material's own `envMap` replaces the scene environment for that
 * material, so handing it an empty capture is not a missing reflection - it
 * is no environment light at all, and every worktop, glass pane and steel
 * front renders black. Any non-zero colour sample means the capture worked;
 * a read that fails counts as failure, and the materials keep the scene
 * environment they already had, which is the good result rather than a
 * broken one.
 */
function probeCaptured(
  renderer: THREE.WebGLRenderer,
  cube: THREE.WebGLCubeRenderTarget,
) {
  const pixels = new Uint8Array(4 * 8 * 8);
  for (let face = 0; face < 6; face++) {
    try {
      renderer.readRenderTargetPixels(cube, 0, 0, 8, 8, pixels, face);
    } catch {
      return false;
    }
    // Alpha comes back as an opaque 1.0 even from a capture that holds no
    // colour at all, so only the colour channels count as evidence.
    for (let i = 0; i < pixels.length; i++)
      if (i % 4 !== 3 && pixels[i] !== 0) return true;
  }
  return false;
}
export function buildKitchenScene(context: BuildContext) {
  const {
    renderer,
    scene,
    design,
    size,
    assets,
    interiors,
    showCeiling,
    quality,
    selected,
    selectedIds,
    openingRef,
    textures,
    stoneMaterials,
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
  } = context;
  const shape = new THREE.Shape(
    roomOutline(design.room).map((p) => new THREE.Vector2(p.x, -p.y)),
  );
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMaterial);
  const floorUV = floor.geometry.getAttribute('uv');
  for (let i = 0; i < floorUV.count; i++)
    floorUV.setXY(
      i,
      floorUV.getX(i) / (floorMaterial.userData.textureInches?.[0] ?? 48),
      floorUV.getY(i) / (floorMaterial.userData.textureInches?.[1] ?? 48),
    );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  floor.userData.surface = 'floor';
  const surfaceObjects: THREE.Object3D[] = [floor];
  if (showCeiling)
    for (const region of ceilingRegions(design.room)) {
      const geometry = new THREE.ShapeGeometry(
          new THREE.Shape(region.map((p) => new THREE.Vector2(p.x, -p.y))),
        ),
        position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i),
          z = -position.getY(i);
        position.setXYZ(i, x, ceilingAt(design.room, x, z), z);
      }
      geometry.computeVertexNormals();
      const cm = material('#f5f2ec');
      cm.side = THREE.DoubleSide;
      const ceiling = new THREE.Mesh(geometry, cm);
      ceiling.receiveShadow = true;
      scene.add(ceiling);
    }

  const walls: {
    group: THREE.Group;
    x: number;
    z: number;
    nx: number;
    nz: number;
  }[] = [];
  for (const edge of wallSegments(design.room)) {
    if (!design.room.walls[edge.side]) continue;
    const group = new THREE.Group();
    scene.add(group);
    const dx = (edge.b.x - edge.a.x) / edge.length,
      dz = (edge.b.y - edge.a.y) / edge.length;
    group.position.set(edge.a.x, 0, edge.a.y);
    group.rotation.y = -Math.atan2(dz, dx);
    for (const points of wallPanels(design, edge)) {
      const outline = new THREE.Shape(
        points.map((p) => new THREE.Vector2(p.x, p.y)),
      );
      const geometry = new THREE.ExtrudeGeometry(outline, {
        depth: 3,
        bevelEnabled: false,
      });
      geometry.translate(0, 0, -3);
      const mesh = new THREE.Mesh(geometry, wall);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    walls.push({
      group,
      x: (edge.a.x + edge.b.x) / 2,
      z: (edge.a.y + edge.b.y) / 2,
      nx: -dz,
      nz: dx,
    });
  }
  const movingFronts: { id: string; apply: (amount: number) => void }[] = [];
  const itemGroups: THREE.Group[] = [];
  // One decision for the whole scene, so fronts cannot differ item to item.
  const plainFronts = design.items.length > FRONT_DETAIL_BUDGET;
  for (const item of design.items.filter((i) => !i.hidden)) {
    const { finish, inset } = finishFor(item.finish ?? design.finish);
    const stone = stoneFor(
      item.countertop ?? design.appearance?.countertop ?? 'quartz',
    );
    const { width: w, height: h, depth: d } = item,
      f = footprint(item);
    const group = new THREE.Group();
    group.userData.itemId = item.id;
    itemGroups.push(group);
    group.position.set(
      item.x + f.width / 2,
      item.elevation,
      item.y + f.depth / 2,
    );
    group.rotation.y = (-item.rotation * Math.PI) / 180;
    scene.add(group);
    const b = (
      bw: number,
      bh: number,
      bd: number,
      x: number,
      y: number,
      z: number,
      m: THREE.Material,
    ) => box(group, bw, bh, bd, x, y, z, m);
    const surface = (y: number, thickness: number) => {
      const e = item.kind === 'island' ? item.surface?.overhangs : undefined;
      const left = e?.left ?? 0,
        back = e?.back ?? 0,
        sw = w + left + (e?.right ?? 0),
        sd = d + back + (e?.front ?? 0);
      for (const p of cutPanels(
        sw,
        sd,
        sinkHoles(item, design.items).map((hole) => ({
          ...hole,
          x: hole.x + left,
          y: hole.y + back,
        })),
      ))
        b(
          p.width,
          thickness,
          p.height,
          p.x + p.width / 2 - w / 2 - left,
          y,
          p.y + p.height / 2 - d / 2 - back,
          stone,
        ).userData.surface = 'countertop';
    };
    if (item.kind === 'countertop') {
      surface(h / 2, h);
      if (item.surface?.waterfall)
        for (const x of [-w / 2 + 0.75, w / 2 - 0.75])
          b(1.5, item.elevation, d, x, -item.elevation / 2, 0, stone);
      continue;
    }
    if (item.kind === 'sink') {
      const basin =
        item.sinkStyle === 'farmhouse' ? material('#f7f5ef', 0, 0.2) : steel;
      b(w, 1, d, 0, 1, 0, basin);
      b(1, h, d, -w / 2 + 0.5, h / 2, 0, basin);
      b(1, h, d, w / 2 - 0.5, h / 2, 0, basin);
      b(w, h, 1, 0, h / 2, -d / 2 + 0.5, basin);
      b(
        w,
        h,
        item.sinkStyle === 'farmhouse' ? 2 : 1,
        0,
        h / 2,
        d / 2 - 0.5,
        basin,
      );
      if (item.sinkMount?.mount === 'drop_in') {
        for (const z of [-d / 2 + 0.5, d / 2 - 0.5])
          b(w + 0.5, 0.35, 1.5, 0, h, z, basin);
        for (const x of [-w / 2 + 0.5, w / 2 - 0.5])
          b(1.5, 0.35, d + 0.5, x, h, 0, basin);
      }
      if (item.sinkMount?.mount === 'apron')
        b(w, h, 2.5, 0, h / 2, d / 2 + 1, basin);
      if (item.sinkStyle === 'double') b(1.2, h - 1, d - 2, 0, h / 2, 0, basin);
      for (const x of item.sinkStyle === 'double' ? [-w / 4, w / 4] : [0]) {
        const drain = new THREE.Mesh(
          new THREE.CylinderGeometry(1, 1, 0.15, 20),
          dark,
        );
        drain.position.set(x, 1.6, 0);
        group.add(drain);
        drainDetails(group, x, steel);
      }
      const faucet =
        design.appearance?.faucet === 'brass'
          ? material('#b99a48', 0.85, 0.25)
          : design.appearance?.faucet === 'black'
            ? material('#242b2b', 0.5, 0.3)
            : steel;
      faucetDetails(group, h, d, faucet);
      continue;
    }
    if (item.kind === 'window' || item.kind === 'door') {
      const pane = b(
        w - 2,
        h - 2,
        1,
        0,
        h / 2,
        0,
        item.kind === 'window' ? windowGlass : finish,
      );
      if (item.kind === 'window') pane.castShadow = false;
      for (const x of [-w / 2 + 1, w / 2 - 1]) b(2, h, d, x, h / 2, 0, wall);
      for (const y of [1, h - 1]) b(w, 2, d, 0, y, 0, wall);
      if (item.kind === 'window') {
        b(1, h, d, 0, h / 2, 0, wall);
        b(w, 1, d, 0, h / 2, 0, wall);
      } else
        b(1, 1, 2, (item.mirrored ? -1 : 1) * (w / 2 - 4), 36, d / 2, steel);
      continue;
    }
    const cabinet =
      item.kind === 'cabinet' ||
      item.kind === 'custom_cabinet' ||
      item.kind === 'island' ||
      item.kind === 'corner';
    if (item.kind === 'partition') {
      for (const panel of partitionPanels(item, design.items))
        b(
          panel.width,
          panel.height,
          d,
          panel.x + panel.width / 2 - w / 2,
          panel.y + panel.height / 2,
          0,
          wall,
        );
      continue;
    }
    if (item.kind === 'hood') {
      b(w, 3, d, 0, 1.5, 0, steel);
      b(w * 0.45, h - 3, d * 0.6, 0, (h + 3) / 2, -d * 0.2, steel);
      b(w - 2, 0.3, d - 2, 0, 0.1, 0, dark);
      continue;
    }
    if (
      [
        'filler',
        'trim',
        'molding',
        'toe_kick',
        'column',
        'beam',
        'partition',
      ].includes(item.kind)
    ) {
      b(
        w,
        h,
        d,
        0,
        h / 2,
        0,
        ['column', 'partition'].includes(item.kind) ? wall : finish,
      );
      if (item.kind === 'molding') b(w, 0.7, d + 1, 0, h - 0.35, 0.5, finish);
      continue;
    }
    if (
      cabinet &&
      design.appearance?.underCabinet &&
      item.elevation >= 48 &&
      item.category === 'wall_cabinet'
    ) {
      const led = material('#fff2d8');
      led.emissive.set('#ffd4a0');
      led.emissiveIntensity = 2;
      b(w - 2, 0.12, 0.5, 0, -0.05, d / 2 - 1, led);
      const glow = new THREE.PointLight('#ffe0b5', 120, 55, 2);
      glow.position.set(0, -2, d / 2);
      group.add(glow);
    }
    if (cabinet) {
      const diagonal =
          item.kind === 'corner' &&
          (item.details?.corner ?? 'diagonal') === 'diagonal',
        cut = diagonal ? Math.min(w, d) * 0.45 : 0;
      const cornerShelf = (y: number, m: THREE.Material) => {
        const shape = new THREE.Shape([
          new THREE.Vector2(-w / 2, d / 2),
          new THREE.Vector2(w / 2, d / 2),
          new THREE.Vector2(w / 2, -d / 2 + cut),
          new THREE.Vector2(w / 2 - cut, -d / 2),
          new THREE.Vector2(-w / 2, -d / 2),
        ]);
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), m);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = y;
        mesh.receiveShadow = true;
        group.add(mesh);
      };
      // Open carcass preserves countertop and sink cutouts.
      const sideHeight = Math.max(1, h - apronHeight(design, item));
      const apronCuts = design.items
        .filter(
          (s) =>
            s.sinkMount?.mount === 'apron' &&
            design.items.some(
              (host) =>
                host.id === s.sinkMount?.hostId &&
                (host.id === item.id ||
                  (host.assemblyId && host.assemblyId === item.assemblyId)),
            ),
        )
        .map((s) => ({
          x:
            worldToLocal(
              item,
              s.x + footprint(s).width / 2,
              s.y + footprint(s).depth / 2,
            ).x -
            s.width / 2,
          y: 0,
          width: s.width,
          height: h - sideHeight,
        }));
      if (sideHeight < h)
        for (const panel of cutPanels(w, h - sideHeight, apronCuts))
          b(
            panel.width,
            panel.height,
            1,
            panel.x + panel.width / 2 - w / 2,
            sideHeight + panel.y + panel.height / 2,
            d / 2,
            finish,
          );

      b(1, sideHeight, d, -w / 2 + 0.5, sideHeight / 2, 0, finish);
      b(1, sideHeight, d - cut, w / 2 - 0.5, sideHeight / 2, -cut / 2, finish);
      b(w, h, 1, 0, h / 2, -d / 2 + 0.5, finish);

      const toe =
        item.elevation === 0 ? Math.min(item.details?.toeKick ?? 4, h - 1) : 0;
      if (diagonal) cornerShelf(toe + 0.5, finish);
      else
        b(
          Math.max(0.2, w - 2),
          1,
          Math.max(0.2, d - 1),
          0,
          toe + 0.5,
          0.5,
          finish,
        );
      if (toe)
        b(
          w - 2,
          toe,
          Math.max(0.2, d - cut - 4),
          0,
          toe / 2,
          -cut / 2 - 2,
          finish,
        );
      if (design.appearance?.staging && item.assemblyId && item.y > 30) {
        for (const sign of [-1, 1]) {
          const p = localToWorld(item, sign < 0 ? -0.2 : w + 0.2, d / 2);
          const neighbor = design.items.some(
            (other) =>
              other.id !== item.id &&
              other.elevation === item.elevation &&
              inside(p, itemPolygon(other)),
          );
          if (!neighbor)
            b(
              0.125,
              h - toe,
              d,
              sign * (w / 2 + 0.0625),
              (h + toe) / 2,
              0,
              finish,
            );
        }
      }
      const details = item.details ?? {
        shelves: 2,
        interior: 'shelves',
        molding: false,
      };
      for (
        let shelf = 1;
        shelf <= (resolvedFront(item) === 'drawers' ? 0 : details.shelves);
        shelf++
      ) {
        const y = toe + ((h - toe) * shelf) / (details.shelves + 1);
        if (details.interior === 'lazy_susan') {
          const shelfMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(
              Math.max(0.1, Math.min(w, d) / 2 - 2),
              Math.max(0.1, Math.min(w, d) / 2 - 2),
              0.6,
              48,
            ),
            inset,
          );
          shelfMesh.position.y = y;
          group.add(shelfMesh);
        } else {
          if (diagonal) cornerShelf(y, inset);
          else
            b(Math.max(0.2, w - 2), 0.6, Math.max(0.2, d - 2), 0, y, 0, inset);
          if (details.interior === 'pullouts' && !diagonal) {
            b(Math.max(0.2, w - 2), 2, 0.5, 0, y + 1, d / 2 - 1, steel);
            for (const x of [-w / 2 + 1, w / 2 - 1])
              b(0.5, 2, Math.max(0.2, d - 2), x, y + 1, 0, steel);
          }
        }
      }
      if (details.molding) {
        b(w + 1, 2, d + 1, 0, h + 1, 0, finish);
        b(w + 2, 0.7, d + 2, 0, h + 2.3, 0, finish);
      }
      const frontHeight = Math.max(toe + 1, h - apronHeight(design, item));
      const style = resolvedFront(item),
        columns = style === 'double' ? 2 : 1,
        rows = style === 'drawers' ? 3 : 1;
      if (!interiors && item.kind !== 'corner')
        for (let col = 0; col < columns; col++)
          for (let row = 0; row < rows; row++) {
            const childStart = group.children.length;
            const pw = w / columns - 0.125,
              ph = (frontHeight - toe) / rows - 0.125,
              x = -w / 2 + ((col + 0.5) * w) / columns,
              y = toe + ((row + 0.5) * (frontHeight - toe)) / rows;
            doorFace(
              b,
              plainFronts ? 'slab' : (design.appearance?.doorStyle ?? 'shaker'),
              pw,
              ph,
              x,
              y,
              d / 2,
              finish,
              inset,
              style === 'glass' ? glass : inset,
            );
            const hx =
              style === 'drawers'
                ? x
                : columns === 2
                  ? x + (col === 0 ? 1 : -1) * (pw / 2 - 2)
                  : x + (item.mirrored ? -1 : 1) * (pw / 2 - 2);
            const handleY =
              isUpperCabinet(item) && style !== 'drawers'
                ? y - ph / 2 + Math.min(5, ph / 2)
                : y + ph / 2 - 5;
            if (plainFronts) {
              // Hardware is the other per-front mesh multiplier; at this size it
              // is a few pixels, so it is dropped with the frame detail.
            } else if (design.appearance?.handleStyle === 'knob') {
              const knob = new THREE.Mesh(
                new THREE.SphereGeometry(0.75, 12, 8),
                hardware,
              );
              knob.position.set(hx, handleY, d / 2 + 1);
              group.add(knob);
            } else if (design.appearance?.handleStyle !== 'none')
              metalPull(
                group,
                hx,
                handleY,
                d / 2 + 1.5,
                5,
                style === 'drawers',
                hardware,
              );
            if (style === 'drawers') {
              b(
                Math.max(0.2, pw - 2),
                0.5,
                Math.max(0.2, d - 4),
                x,
                y - ph / 2 + 1,
                1,
                inset,
              );
              for (const sign of [-1, 1])
                b(
                  0.5,
                  Math.max(1, ph * 0.55),
                  Math.max(0.2, d - 4),
                  x + sign * (pw / 2 - 1),
                  y - ph * 0.15,
                  1,
                  inset,
                );
            }
            const parts = group.children.slice(childStart);
            const pivot = new THREE.Group();
            const right = columns === 2 ? col === 1 : !!item.mirrored;
            if (style !== 'drawers')
              pivot.position.set(x + (right ? pw / 2 : -pw / 2), 0, d / 2);
            group.add(pivot);
            for (const part of parts) pivot.attach(part);
            movingFronts.push({
              id: item.id,
              apply: (amount) => {
                const value = !selected || selected === item.id ? amount : 0;
                if (style === 'drawers')
                  pivot.position.z = value * Math.max(1, d - 4) * 0.75;
                else
                  pivot.rotation.y = (right ? 1 : -1) * value * Math.PI * 0.5;
              },
            });
          }
      if (diagonal) {
        cornerShelf(h, finish);
        if (!interiors) {
          const panel = b(
            Math.hypot(cut, cut),
            h - toe,
            1,
            w / 2 - cut / 2,
            (h + toe) / 2,
            d / 2 - cut / 2,
            finish,
          );
          panel.rotation.y = Math.PI / 4;
          b(w - cut, h - toe, 1, -cut / 2, (h + toe) / 2, d / 2, finish);
          b(1, h - toe, d - cut, w / 2, (h + toe) / 2, -cut / 2, finish);
        }
      }
      if (item.kind === 'corner' && !diagonal && !interiors) {
        const sign = item.details?.corner === 'blind_left' ? 1 : -1;
        b(w / 2, h - toe, 1, (-sign * w) / 4, (h + toe) / 2, d / 2, finish);
        b(
          w / 2 - 0.6,
          h - toe - 0.6,
          1,
          (sign * w) / 4,
          (h + toe) / 2,
          d / 2,
          finish,
        );
        b(
          Math.max(0.2, w / 2 - 4),
          Math.max(0.2, h - toe - 4),
          0.3,
          (sign * w) / 4,
          (h + toe) / 2,
          d / 2 + 0.6,
          inset,
        );
        b(0.5, 5, 1, sign * (w / 2 - 3), h - 6, d / 2 + 1, steel);
      }
      if (item.kind === 'island') {
        surface(h - 0.75, 1.5);
        if (item.surface?.waterfall)
          for (const x of [-w / 2 + 0.75, w / 2 - 0.75])
            b(1.5, h, d, x, h / 2, 0, stone);
      }
      if (item.elevation >= 40 && design.appearance?.underCabinet) {
        const strip = material('#fff3cd');
        strip.emissive.set('#ffd995');
        strip.emissiveIntensity = 2;
        b(Math.max(1, w - 2), 0.3, 1, 0, -0.2, d / 2 - 2, strip);
        const light = new THREE.PointLight('#ffe0a5', 110, 70, 2);
        light.position.set(0, -2, d / 2 - 2);
        group.add(light);
      } else if (
        !diagonal &&
        item.kind !== 'island' &&
        !design.items.some(
          (s) =>
            s.sinkMount &&
            design.items.some(
              (host) =>
                host.id === s.sinkMount?.hostId &&
                host.assemblyId &&
                host.assemblyId === item.assemblyId,
            ),
        ) &&
        !design.items.some(
          (s) =>
            s.kind === 'sink' &&
            containsFootprint(item, s) &&
            s.elevation < item.elevation + item.height &&
            s.elevation + s.height > item.elevation + item.height,
        )
      )
        b(w, 0.6, d, 0, h - 0.3, 0, finish);
    } else {
      applianceDetails(group, item, b, steel, dark, glass, (apply) =>
        movingFronts.push({
          id: item.id,
          apply: (amount) =>
            apply(!selected || selected === item.id ? amount : 0),
        }),
      );
    }
  }

  if (
    design.appearance?.backsplash &&
    design.appearance.backsplash !== 'none'
  ) {
    for (const run of backsplashRuns(design)) {
      const group = new THREE.Group();
      group.userData.surface = 'backsplash';
      surfaceObjects.push(group);
      group.position.set(run.x, 0, run.z);
      group.rotation.y = run.rotation;
      scene.add(group);
      const tile = ['subway', 'mosaic', 'stacked'].includes(
        design.appearance.backsplash,
      )
        ? material('#ffffff', 0.02, 0.35)
        : stoneFor(design.appearance.countertop);
      if (
        ['subway', 'mosaic', 'stacked'].includes(design.appearance.backsplash)
      ) {
        const map = materialTexture(
          design.appearance.backsplash as 'subway' | 'mosaic' | 'stacked',
        );
        textures.push(map);
        tile.map = map;
        tile.userData.textureInches = [12, 12];
        tile.bumpMap = map;
        tile.bumpScale = 0.03;
      }
      const panels = cutPanels(run.width, run.height, run.holes);
      for (const p of panels)
        box(
          group,
          p.width,
          p.height,
          0.3,
          p.x + p.width / 2,
          run.bottom + p.y + p.height / 2,
          0.18,
          tile,
        );
      if (design.appearance.outlets ?? design.appearance.staging) {
        const p = panels.find((p) => p.width >= 14 && p.height >= 12);
        if (p) {
          const x = p.x + p.width * 0.6,
            y = run.bottom + p.y + 6;
          box(group, 2.7, 4.3, 0.25, x, y, 0.55, wall);
          for (const yy of [-0.65, 0.65])
            for (const xx of [-0.3, 0.3])
              box(group, 0.12, 0.4, 0.15, x + xx, y + yy, 0.72, dark);
        }
      }
    }
  }
  for (const front of movingFronts) front.apply(openingRef.current / 100);
  if (design.appearance?.pendants) {
    const island = design.items
      .filter(
        (i) =>
          !i.hidden &&
          (i.kind === 'countertop' || i.kind === 'island') &&
          i.y > 30 &&
          i.width >= 48,
      )
      .sort((a, b) => b.width - a.width)[0];
    if (island) {
      const f = footprint(island),
        top = island.elevation + island.height,
        midX = island.x + f.width / 2,
        midZ = island.y + f.depth / 2;
      const count = Math.max(2, Math.min(3, Math.floor(f.width / 32)));
      for (let i = 0; i < count; i++) {
        const x = island.x + ((i + 0.5) * f.width) / count,
          y = Math.min(top + 36, ceilingAt(design.room, x, midZ) - 12),
          ceiling = ceilingAt(design.room, x, midZ);
        const cord = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, Math.max(1, ceiling - y), 10),
          dark,
        );
        cord.position.set(x, (ceiling + y) / 2, midZ);
        scene.add(cord);
        const shade = new THREE.Mesh(
          new THREE.ConeGeometry(5, 6, 40, 1, true),
          hardware,
        );
        shade.position.set(x, y, midZ);
        shade.castShadow = true;
        shade.material.side = THREE.DoubleSide;
        scene.add(shade);
        const bulb = material('#fff7e0');
        bulb.emissive.set('#ffe2ac');
        bulb.emissiveIntensity =
          (2 * (design.appearance?.pendantLevel ?? 100)) / 100;
        const globe = new THREE.Mesh(
          new THREE.SphereGeometry(1.2, 16, 12),
          bulb,
        );
        globe.position.set(x, y - 2, midZ);
        scene.add(globe);
        const lamp = new THREE.PointLight(
          '#ffe0ad',
          (200 * (design.appearance?.pendantLevel ?? 100)) / 100,
          100,
          2,
        );
        lamp.position.set(x, y - 4, midZ);
        scene.add(lamp);
      }
      const ceramic = material('#d6c4a6', 0.05, 0.5);
      const bowl = new THREE.Mesh(
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(2, 0.3),
            new THREE.Vector2(4, 1),
            new THREE.Vector2(5, 2.3),
            new THREE.Vector2(4.7, 2.4),
            new THREE.Vector2(3.7, 1.2),
            new THREE.Vector2(0, 0.5),
          ],
          40,
        ),
        ceramic,
      );
      bowl.position.set(midX + f.width * 0.22, top + 0.1, midZ);
      bowl.castShadow = true;
      bowl.receiveShadow = true;
      scene.add(bowl);
    }
  }
  if (design.appearance?.staging) {
    const island = design.items
      .filter(
        (i) =>
          !i.hidden &&
          (i.kind === 'countertop' || i.kind === 'island') &&
          i.y > 30 &&
          i.width >= 48,
      )
      .sort((a, b) => b.width - a.width)[0];
    if (island && island.surface?.seating !== 'none') {
      const f = footprint(island),
        side = island.surface?.seating ?? 'south',
        seat = material('#c3ad8b', 0, 0.9);
      const seatingLength =
        side === 'east' || side === 'west' ? f.depth : f.width;
      for (const fraction of seatingLength < 48 ? [0.5] : [0.25, 0.75]) {
        const x =
          side === 'east'
            ? island.x + f.width + 12
            : side === 'west'
              ? island.x - 12
              : island.x + f.width * fraction;
        const z =
          side === 'north'
            ? island.y - 12
            : side === 'south'
              ? island.y + f.depth + 3
              : island.y + f.depth * fraction;
        const blocked = design.items.some((i) => {
          const b = footprint(i);
          return (
            i.elevation < 28 &&
            i.x < x + 8 &&
            i.x + b.width > x - 8 &&
            i.y < z + 8 &&
            i.y + b.depth > z - 8
          );
        });
        if (!blocked && rectangleInside(design.room, x - 8, z - 8, 16, 16)) {
          const stool = new THREE.Group();
          stool.position.set(x, 0, z);
          stool.rotation.y =
            side === 'north'
              ? Math.PI
              : side === 'east'
                ? Math.PI / 2
                : side === 'west'
                  ? -Math.PI / 2
                  : 0;
          scene.add(stool);
          if (assets)
            stool.add(cloneDecorativeModel(assets.stool, materials, textures));
          else {
            box(stool, 14, 2, 14, 0, 25, 0, seat);
            for (const xx of [-5, 5])
              for (const zz of [-5, 5]) box(stool, 1, 24, 1, xx, 12, zz, dark);
            box(stool, 11, 0.5, 0.5, 0, 9, 5, dark);
            box(stool, 14, 10, 1, 0, 31, 6, seat);
          }
        }
      }
    }
    const counter = design.items.find(
      (i) => i.kind === 'countertop' && i.width >= 24 && i.y < 3,
    );
    if (counter) {
      const top = counter.elevation + counter.height,
        wood = finishFor('oak').finish,
        ceramic = material('#e7e0d2', 0, 0.65);
      box(
        scene,
        10,
        0.65,
        7,
        counter.x + counter.width * 0.4,
        top + 0.35,
        counter.y + 10,
        wood,
      );
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(2.4, 1.8, 4, 24),
        ceramic,
      );
      pot.position.set(counter.x + 5, top + 2, counter.y + 5);
      pot.castShadow = true;
      scene.add(pot);
      const green = material('#54724b', 0, 0.9);
      for (let i = 0; i < 9; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), green);
        leaf.scale.set(0.6, 3, 0.35);
        leaf.rotation.z = Math.sin(i) * 0.6;
        leaf.position.set(
          counter.x + 5 + Math.sin(i) * 1.5,
          top + 6 + Math.cos(i),
          counter.y + 5 + Math.cos(i) * 1.5,
        );
        scene.add(leaf);
      }
    }
  }
  for (const id of new Set([
    ...(selectedIds ?? []),
    ...(selected ? [selected] : []),
  ])) {
    const target = itemGroups.find((g) => g.userData.itemId === id);
    if (target) {
      const outline = new THREE.BoxHelper(target, 0x087984);
      scene.add(outline);
      materials.push(outline.material as THREE.Material);
    }
  }
  let roomReflection: THREE.WebGLRenderTarget | undefined;
  if (quality) {
    // Byte, not half-float. The room is a lit interior rather than a sky, so
    // the extra range buys very little here, and a half-float cube comes
    // back unusable as PMREM input on software WebGL - which turned every
    // worktop, glass pane and steel front in the view black.
    const cube = new THREE.WebGLCubeRenderTarget(128, {
      type: THREE.UnsignedByteType,
    });
    const probe = new THREE.CubeCamera(0.5, size * 10, cube);
    const location = walkEntry(design) ?? [
      design.room.width / 2,
      design.room.height * 0.7,
      design.room.depth / 2,
    ];
    probe.position.set(...location);
    probe.update(renderer, scene);
    if (probeCaptured(renderer, cube)) {
      const generator = new THREE.PMREMGenerator(renderer);
      roomReflection = generator.fromCubemap(cube.texture);
      generator.dispose();
      for (const m of [
        steel,
        hardware,
        glass,
        windowGlass,
        ...stoneMaterials.values(),
      ]) {
        m.envMap = roomReflection.texture;
        m.envMapIntensity = 0.75;
      }
    }
    cube.dispose();
  }

  // movingFronts is animated per frame by the caller's opening tween.
  return { walls, itemGroups, surfaceObjects, roomReflection, movingFronts };
}
