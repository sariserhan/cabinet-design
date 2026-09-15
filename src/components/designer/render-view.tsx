'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  openingConflicts,
  presentationViews,
  walkPosition,
  walkEntry,
  materialVariant,
  backsplashRuns,
} from '@/designer/render-planning';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applianceDetails, metalPull } from './render-details';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { apronHeight, closeupViews } from '@/designer/refinements';
import { materialTexture } from './render-textures';
import { wallPanels, partitionPanels } from '@/designer/model';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Design } from '@/designer/model';
import {
  itemPolygon,
  isUpperCabinet,
  localToWorld,
  worldToLocal,
  containsFootprint,
  cutPanels,
  footprint,
  resolvedFront,
  sinkHoles,
} from '@/designer/model';
import {
  rectangleInside,
  inside,
  wallSegments,
  roomOutline,
  ceilingAt,
  ceilingRegions,
} from '@/designer/room';

export type CameraView = {
  position: [number, number, number];
  target: [number, number, number];
};

export default function RenderView({
  design: sourceDesign,
  onChange,
  cameraView,
  onCamera,
  onCapture,
  selected,
  selectedIds,
  onSelect,
}: {
  selected?: string | null;
  selectedIds?: string[];
  onSelect?: (id: string | null) => void;
  cameraView?: CameraView;
  onCamera?: (view: CameraView) => void;
  onCapture?: (url: string) => void;
  design: Design;
  onChange: (design: Design) => void;
}) {
  const [variant, setVariant] = useState('original');
  const design = useMemo(
    () => materialVariant(sourceDesign, variant),
    [sourceDesign, variant],
  );
  const [speed, setSpeed] = useState(30);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const callbacks = useRef({ onCamera, onCapture, onSelect });
  callbacks.current = { onCamera, onCapture, onSelect };
  const externalCamera = useRef(cameraView);
  externalCamera.current = cameraView;
  const host = useRef<HTMLDivElement>(null);
  type View = NonNullable<Design['views']>[number];
  const actions = useRef<{
    walk: (forward: number, side: number, turn?: number) => void;
    open: (amount: number) => void;
    fit: () => void;
    save: (width: number, captureOnly?: boolean) => void;
    capture: () => Pick<View, 'position' | 'target'>;
    load: (view: CameraView) => void;
  } | null>(null);
  const [viewName, setViewName] = useState('Camera view'),
    [exportWidth, setExportWidth] = useState(1920),
    [viewId, setViewId] = useState('');
  const cameraState = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    walking: boolean;
  } | null>(null);
  const [quality, setQuality] = useState(false),
    [walking, setWalking] = useState(false),
    [opening, setOpening] = useState(0);
  const conflicts = useMemo(
    () => openingConflicts(design, opening, selected),
    [design, opening, selected],
  );
  const openingRef = useRef(opening);
  openingRef.current = opening;
  const [error, setError] = useState('');
  const [cutaway, setCutaway] = useState(true);
  const [interiors, setInteriors] = useState(false);
  const [showCeiling, setShowCeiling] = useState(false);
  useEffect(() => {
    if (cameraView) actions.current?.load(cameraView);
  }, [cameraView]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setError(
        'Rendering requires WebGL2. Enable hardware acceleration in your browser, or use 3D preview.',
      );
      return;
    }
    setError('');
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = quality
      ? THREE.VSMShadowMap
      : THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.domElement.setAttribute('aria-label', 'Rendered kitchen');
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer),
      environmentScene = new RoomEnvironment(),
      environment = pmrem.fromScene(environmentScene, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.32;
    environmentScene.dispose();
    pmrem.dispose();
    const lighting = design.appearance?.lighting ?? 'daylight';
    scene.background = new THREE.Color('#e9edf0');
    const size = Math.max(
      design.room.width,
      design.room.depth,
      design.room.height,
    );
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, size * 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.015;
    controls.minDistance = 15;
    controls.maxDistance = size * 6;
    const fit = () => {
      if (walking) {
        const p = walkEntry(design);
        if (p) {
          camera.position.set(...p);
          controls.target.set(p[0], p[1], p[2] - 60);
          camera.lookAt(controls.target);
          controls.update();
        }
        return;
      }

      controls.target.set(
        design.room.width / 2,
        design.room.height * 0.22,
        design.room.depth / 2,
      );
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3(size * 1.1, size, size * 1.3));
      controls.update();
    };
    if (externalCamera.current) {
      camera.position.set(...externalCamera.current.position);
      controls.target.set(...externalCamera.current.target);
      controls.update();
    } else if (cameraState.current) {
      camera.position.copy(cameraState.current.position);
      controls.target.copy(cameraState.current.target);
      controls.update();
    } else if (design.views?.[0]) {
      camera.position.set(...design.views[0].position);
      controls.target.set(...design.views[0].target);
      controls.update();
    } else fit();
    if (walking) {
      const p =
        walkPosition(design, camera.position.x, camera.position.z) ??
        walkEntry(design);
      if (!p)
        setError(
          'There is no clear standing space for a walkthrough. Move objects or use orbit mode.',
        );
      if (p) {
        const delta = new THREE.Vector3(...p).sub(camera.position);
        camera.position.set(...p);
        if (cameraState.current?.walking) controls.target.add(delta);
        else
          controls.target.set(
            design.room.width / 2,
            p[1],
            design.room.depth * 0.15,
          );
      }
      controls.enabled = false;
      camera.lookAt(controls.target);
    }
    scene.add(
      new THREE.HemisphereLight(
        lighting === 'warm' ? '#ffdfb4' : '#ffffff',
        '#a39a8c',
        design.appearance?.lightingProfile === 'task'
          ? 0.12
          : design.appearance?.lightingProfile === 'evening'
            ? 0.28
            : lighting === 'studio'
              ? 0.65
              : 0.48,
      ),
    );
    const sun = new THREE.DirectionalLight(
      lighting === 'warm' ? '#ffcb91' : '#fff4dd',
      design.appearance?.lightingProfile === 'task'
        ? 0.08
        : design.appearance?.lightingProfile === 'evening'
          ? 0.5
          : lighting === 'studio'
            ? 2.2
            : 3.2,
    );
    sun.position.set(-size * 0.4, size * 2, size * 0.8);
    sun.target.position.set(design.room.width / 2, 0, design.room.depth / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.00005;
    sun.shadow.radius = 2;
    Object.assign(sun.shadow.camera, {
      left: -size,
      right: size,
      top: size,
      bottom: -size,
      near: 1,
      far: size * 6,
    });
    sun.shadow.normalBias = 0.3;
    scene.add(sun, sun.target);
    const fillLight = new THREE.DirectionalLight(
      '#d6e7ff',
      design.appearance?.lightingProfile === 'task'
        ? 0.03
        : design.appearance?.lightingProfile === 'evening'
          ? 0.1
          : lighting === 'studio'
            ? 0.7
            : 0.25,
    );
    fillLight.position.set(size, size, -size);
    scene.add(fillLight);
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

    const materials: THREE.Material[] = [];
    const material = (color: string, metalness = 0, roughness = 0.65) => {
      const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
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
        { linen: '#d9d3c6', oak: '#ead5b5', slate: '#34404a' }[name],
      );
      if (name === 'oak') {
        finish.map = textures[0] ?? null;
        inset.map = textures[0] ?? null;
        finish.bumpMap = textures[0] ?? null;
        finish.bumpScale = 0.08;
      }
      const pair = { finish, inset };
      finishMaterials.set(name, pair);
      return pair;
    };
    const stoneMaterials = new Map<string, THREE.MeshStandardMaterial>();
    const stoneFor = (name: 'quartz' | 'marble' | 'granite') => {
      const cached = stoneMaterials.get(name);
      if (cached) return cached;
      const m = material('#ffffff', 0.05, 0.23);
      const texture = materialTexture(name);
      textures.push(texture);
      m.map = texture;
      m.bumpMap = texture;
      m.bumpScale = name === 'granite' ? 0.035 : 0.012;
      m.roughness = name === 'granite' ? 0.32 : 0.2;
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
    steel.bumpMap = brushed;
    steel.bumpScale = 0.008;
    const floorMaterial = material('#ffffff', 0, 0.7);
    floorMaterial.map = textures[2] ?? null;

    const box = (
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
      if (m instanceof THREE.MeshStandardMaterial && m.map === textures[0]) {
        const uv = mesh.geometry.getAttribute('uv'),
          normal = mesh.geometry.getAttribute('normal');
        for (let i = 0; i < uv.count; i++) {
          const vertical = Math.abs(normal.getY(i)) < 0.5;
          const scaleX = Math.abs(normal.getX(i)) > 0.5 ? d : w;
          uv.setXY(
            i,
            (uv.getX(i) * scaleX) / 24,
            (uv.getY(i) * (vertical ? h : d)) / 36,
          );
        }
      }
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const shape = new THREE.Shape(
      roomOutline(design.room).map((p) => new THREE.Vector2(p.x, -p.y)),
    );
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMaterial);
    const floorUV = floor.geometry.getAttribute('uv');
    for (let i = 0; i < floorUV.count; i++)
      floorUV.setXY(i, floorUV.getX(i) / 48, floorUV.getY(i) / 48);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
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
          );
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
        if (item.sinkStyle === 'double')
          b(1.2, h - 1, d - 2, 0, h / 2, 0, basin);
        for (const x of item.sinkStyle === 'double' ? [-w / 4, w / 4] : [0]) {
          const drain = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 0.15, 20),
            dark,
          );
          drain.position.set(x, 1.6, 0);
          group.add(drain);
        }
        const faucet =
          design.appearance?.faucet === 'brass'
            ? material('#b99a48', 0.85, 0.25)
            : design.appearance?.faucet === 'black'
              ? material('#242b2b', 0.5, 0.3)
              : steel;
        b(1, 9, 1, 0, h + 4, -d / 2 + 2, faucet);
        b(1, 1, 7, 0, h + 8, -d / 2 + 5, faucet);
        continue;
      }
      if (item.kind === 'window' || item.kind === 'door') {
        b(
          w - 2,
          h - 2,
          1,
          0,
          h / 2,
          0,
          item.kind === 'window' ? windowGlass : finish,
        );
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
        b(
          1,
          sideHeight,
          d - cut,
          w / 2 - 0.5,
          sideHeight / 2,
          -cut / 2,
          finish,
        );
        b(w, h, 1, 0, h / 2, -d / 2 + 0.5, finish);

        const toe =
          item.elevation === 0
            ? Math.min(item.details?.toeKick ?? 4, h - 1)
            : 0;
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
            -cut / 2 - 1,
            dark,
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
              b(
                Math.max(0.2, w - 2),
                0.6,
                Math.max(0.2, d - 2),
                0,
                y,
                0,
                inset,
              );
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
              const pw = w / columns - 0.6,
                ph = (frontHeight - toe) / rows - 0.6,
                x = -w / 2 + ((col + 0.5) * w) / columns,
                y = toe + ((row + 0.5) * (frontHeight - toe)) / rows;
              b(pw, ph, 0.75, x, y, d / 2, inset);
              b(
                Math.max(0.2, pw - 4),
                Math.max(0.2, ph - 4),
                0.2,
                x,
                y,
                d / 2 + 0.3,
                style === 'glass' ? glass : inset,
              );
              for (const sign of [-1, 1]) {
                b(
                  1.8,
                  ph,
                  0.3,
                  x + sign * (pw / 2 - 0.9),
                  y,
                  d / 2 + 0.55,
                  finish,
                );
                b(
                  Math.max(0.2, pw - 3.6),
                  1.8,
                  0.3,
                  x,
                  y + sign * (ph / 2 - 0.9),
                  d / 2 + 0.55,
                  finish,
                );
              }
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
              if (design.appearance?.handleStyle === 'knob') {
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
        applianceDetails(group, item, b, steel, dark, glass);
      }
    }

    if (
      design.appearance?.backsplash &&
      design.appearance.backsplash !== 'none'
    ) {
      for (const run of backsplashRuns(design)) {
        const group = new THREE.Group();
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
          map.repeat.set(run.width / 24, 1.5);
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
            new THREE.CylinderGeometry(
              0.12,
              0.12,
              Math.max(1, ceiling - y),
              10,
            ),
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
            box(stool, 14, 2, 14, 0, 25, 0, seat);
            for (const xx of [-5, 5])
              for (const zz of [-5, 5]) box(stool, 1, 24, 1, xx, 12, zz, dark);
            box(stool, 11, 0.5, 0.5, 0, 9, 5, dark);
            box(stool, 14, 10, 1, 0, 31, 6, seat);
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
          const leaf = new THREE.Mesh(
            new THREE.SphereGeometry(1, 10, 8),
            green,
          );
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
    const composer = quality ? new EffectComposer(renderer) : null;
    const ao = quality ? new SSAOPass(scene, camera, 512, 512) : null;
    const output = quality ? new OutputPass() : null;
    if (composer && ao && output) {
      ao.kernelRadius = 12;
      ao.minDistance = 0.002;
      ao.maxDistance = 0.06;
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(ao);
      composer.addPass(output);
    }
    let postWidth = 0,
      postHeight = 0;
    const step = (forward: number, side: number, turn = 0) => {
      const direction = camera.getWorldDirection(new THREE.Vector3());
      direction.y = 0;
      direction.normalize();
      if (turn) {
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
        controls.target.copy(camera.position).addScaledVector(direction, 60);
      } else {
        const lateral = new THREE.Vector3().crossVectors(
          direction,
          new THREE.Vector3(0, 1, 0),
        );
        const next = camera.position
          .clone()
          .addScaledVector(direction, forward * 6)
          .addScaledVector(lateral, side * 6);
        const p = walkPosition(design, next.x, next.z);
        if (!p) return;
        const delta = new THREE.Vector3(...p).sub(camera.position);
        camera.position.set(...p);
        controls.target.add(delta);
      }
      camera.lookAt(controls.target);
      render();
      callbacks.current.onCamera?.({
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
      });
    };
    const held = new Set<string>();
    const key = (e: KeyboardEvent) => {
      if (!walking) return;
      const moves: Record<string, [number, number, number?]> = {
        w: [1, 0],
        s: [-1, 0],
        a: [0, -1],
        d: [0, 1],
        ArrowUp: [1, 0],
        ArrowDown: [-1, 0],
        ArrowLeft: [0, 0, 0.12],
        ArrowRight: [0, 0, -0.12],
      };
      const keyName = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const move = moves[keyName];
      if (move) {
        e.preventDefault();
        held.add(keyName);
      }
    };
    const keyUp = (e: KeyboardEvent) =>
      held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const clearKeys = () => held.clear();
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clearKeys);
    renderer.domElement.addEventListener('blur', clearKeys);
    let cameraTween: {
      start: number;
      from: THREE.Vector3;
      targetFrom: THREE.Vector3;
      to: THREE.Vector3;
      targetTo: THREE.Vector3;
    } | null = null;
    controls.addEventListener('start', () => {
      cameraTween = null;
    });
    let frame = 0,
      lastFrame = 0;
    let currentOpening = openingRef.current,
      targetOpening = currentOpening;
    const animate = (now: number) => {
      const elapsed = (now - (lastFrame || now)) / 1000;
      const dt = Math.min(0.05, elapsed);
      lastFrame = now;
      if (cameraTween) {
        const t = Math.min(1, (now - cameraTween.start) / 700),
          ease = t * t * (3 - 2 * t);
        camera.position.lerpVectors(cameraTween.from, cameraTween.to, ease);
        controls.target.lerpVectors(
          cameraTween.targetFrom,
          cameraTween.targetTo,
          ease,
        );
        controls.update();
        render();
        if (t === 1) cameraTween = null;
      }
      if (walking && held.size) {
        const f =
          Number(held.has('w') || held.has('ArrowUp')) -
          Number(held.has('s') || held.has('ArrowDown'));
        const side = Number(held.has('d')) - Number(held.has('a'));
        const turn =
          Number(held.has('ArrowLeft')) - Number(held.has('ArrowRight'));
        const scale =
          (speedRef.current * dt) / (6 * Math.max(1, Math.hypot(f, side)));
        if (f || side) step(f * scale, side * scale);
        if (turn) step(0, 0, turn * dt * 1.5);
      }
      if (Math.abs(targetOpening - currentOpening) > 0.01) {
        const distance = targetOpening - currentOpening;
        currentOpening +=
          Math.sign(distance) * Math.min(Math.abs(distance), elapsed * 150);
        for (const front of movingFronts) front.apply(currentOpening / 100);
        render();
      }
      frame = requestAnimationFrame(animate);
    };
    renderer.domElement.tabIndex = 0;
    renderer.domElement.addEventListener('keydown', key);
    let look: { x: number; y: number; direction: THREE.Vector3 } | null = null;
    const lookDown = (e: PointerEvent) => {
      if (walking && e.button === 0) {
        renderer.domElement.focus();
        renderer.domElement.setPointerCapture(e.pointerId);
        look = {
          x: e.clientX,
          y: e.clientY,
          direction: camera.getWorldDirection(new THREE.Vector3()),
        };
      }
    };
    const lookMove = (e: PointerEvent) => {
      if (!look) return;
      const spherical = new THREE.Spherical().setFromVector3(look.direction);
      spherical.theta -= (e.clientX - look.x) * 0.005;
      spherical.phi = Math.max(
        0.3,
        Math.min(Math.PI - 0.3, spherical.phi + (e.clientY - look.y) * 0.005),
      );
      controls.target
        .copy(camera.position)
        .add(
          new THREE.Vector3().setFromSpherical(spherical).multiplyScalar(60),
        );
      camera.lookAt(controls.target);
      render();
    };
    const lookEnd = () => {
      if (look)
        callbacks.current.onCamera?.({
          position: camera.position.toArray() as [number, number, number],
          target: controls.target.toArray() as [number, number, number],
        });
      look = null;
    };
    renderer.domElement.addEventListener('pointerdown', lookDown);
    renderer.domElement.addEventListener('pointermove', lookMove);
    renderer.domElement.addEventListener('pointerup', lookEnd);
    renderer.domElement.addEventListener('pointercancel', lookEnd);
    let press: { x: number; y: number } | null = null;
    const pointerDown = (e: PointerEvent) => {
      press = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    };
    const pointerUp = (e: PointerEvent) => {
      if (
        walking ||
        !press ||
        Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5
      )
        return;
      press = null;
      const rect = renderer.domElement.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(itemGroups, true).find((h) => {
        let o: THREE.Object3D | null = h.object;
        while (o) {
          if (!o.visible) return false;
          o = o.parent;
        }
        return true;
      });
      let object: THREE.Object3D | null = hit?.object ?? null;
      while (object && !object.userData.itemId) object = object.parent;
      callbacks.current.onSelect?.(object?.userData.itemId ?? null);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    const render = () => {
      for (const w of walls)
        w.group.visible =
          !cutaway ||
          (camera.position.x - w.x) * w.nx + (camera.position.z - w.z) * w.nz >=
            0;
      if (composer && ao) {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        if (size.x !== postWidth || size.y !== postHeight) {
          postWidth = size.x;
          postHeight = size.y;
          composer.setPixelRatio(1);
          composer.setSize(size.x, size.y);
          ao.setSize(Math.min(1280, size.x), Math.min(1280, size.y));
        }
        composer.render();
      } else renderer.render(scene, camera);
    };
    controls.addEventListener('change', render);
    const resize = () => {
      const width = container.clientWidth,
        height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    frame = requestAnimationFrame(animate);
    const lost = (event: Event) => {
      event.preventDefault();
      setError(
        'The graphics context was lost. Switch to 2D plan, then reopen Render.',
      );
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    controls.addEventListener('end', () =>
      callbacks.current.onCamera?.({
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
      }),
    );
    actions.current = {
      walk: step,
      open: (amount) => {
        targetOpening = amount;
      },
      fit,
      capture: () => ({
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
      }),
      load: (view) => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          camera.position.set(...view.position);
          controls.target.set(...view.target);
          controls.update();
          render();
        } else
          cameraTween = {
            start: performance.now(),
            from: camera.position.clone(),
            targetFrom: controls.target.clone(),
            to: new THREE.Vector3(...view.position),
            targetTo: new THREE.Vector3(...view.target),
          };
      },
      save: (width, captureOnly = false) => {
        const oldSize = renderer.getSize(new THREE.Vector2()),
          oldRatio = renderer.getPixelRatio();
        try {
          renderer.setPixelRatio(1);
          renderer.setSize(width, Math.round(width / camera.aspect), false);
          render();
          const link = document.createElement('a');
          link.download = `${design.name.replace(/[^a-z0-9-]/gi, '-').slice(0, 80) || 'kitchen'}-render.png`;
          link.href = renderer.domElement.toDataURL('image/png');
          if (captureOnly) callbacks.current.onCapture?.(link.href);
          else link.click();
        } catch {
          setError('Image export failed. Try reopening Render.');
        } finally {
          renderer.setSize(oldSize.x, oldSize.y, false);
          renderer.setPixelRatio(oldRatio);
          render();
        }
      },
    };
    return () => {
      cameraState.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
        walking,
      };
      cancelAnimationFrame(frame);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clearKeys);
      renderer.domElement.removeEventListener('blur', clearKeys);
      observer.disconnect();
      renderer.domElement.removeEventListener('keydown', key);
      renderer.domElement.removeEventListener('pointerdown', lookDown);
      renderer.domElement.removeEventListener('pointermove', lookMove);
      renderer.domElement.removeEventListener('pointerup', lookEnd);
      renderer.domElement.removeEventListener('pointercancel', lookEnd);
      ao?.dispose();
      output?.dispose();
      composer?.dispose();
      controls.dispose();
      actions.current = null;
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        )
          object.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [
    design,
    cutaway,
    interiors,
    showCeiling,
    selected,
    selectedIds,
    quality,
    walking,
  ]);
  return (
    <div className="designer-render">
      <div className="designer-row render-controls">
        <details className="render-menu">
          <summary>Camera & walk</summary>
          <div className="render-menu-content designer-row">
            {' '}
            <select
              aria-label="Presentation camera angle"
              defaultValue=""
              onChange={(e) => {
                const view = presentationViews(design).find(
                  (v) => v.id === e.target.value,
                );
                if (view) {
                  setWalking(false);
                  actions.current?.load(view);
                  onCamera?.(view);
                }
              }}
            >
              <option value="">Choose presentation angle</option>
              {presentationViews(design).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <label>
              <input
                type="checkbox"
                checked={walking}
                onChange={(e) => setWalking(e.target.checked)}
              />{' '}
              Eye-level walkthrough
            </label>
            <button
              onClick={() => {
                actions.current?.fit();
                const view = actions.current?.capture();
                if (view) onCamera?.(view);
              }}
            >
              Reset camera
            </button>
          </div>
        </details>
        <details className="render-menu">
          <summary>Lighting & scene</summary>
          <div className="render-menu-content designer-row">
            <label>
              Lighting
              <select
                aria-label="Render lighting"
                value={sourceDesign.appearance?.lighting ?? 'daylight'}
                onChange={(e) =>
                  onChange({
                    ...sourceDesign,
                    appearance: {
                      ...sourceDesign.appearance,
                      countertop:
                        sourceDesign.appearance?.countertop ?? 'quartz',
                      lighting: e.target.value as
                        'daylight' | 'warm' | 'studio',
                    },
                  })
                }
              >
                <option value="daylight">Daylight</option>
                <option value="warm">Warm evening</option>
                <option value="studio">Studio</option>
              </select>
            </label>{' '}
            <label>
              <input
                type="checkbox"
                checked={quality}
                onChange={(e) => setQuality(e.target.checked)}
              />{' '}
              High quality shadows
            </label>
            <label>
              <input
                type="checkbox"
                checked={showCeiling}
                onChange={(e) => setShowCeiling(e.target.checked)}
              />{' '}
              Show ceiling
            </label>
            <label>
              <input
                type="checkbox"
                checked={cutaway}
                onChange={(e) => setCutaway(e.target.checked)}
              />{' '}
              Cutaway walls
            </label>
          </div>
        </details>
        <details className="render-menu">
          <summary>Cabinet fronts</summary>
          <div className="render-menu-content designer-row">
            {' '}
            <label>
              Front opening (%)
              <input
                aria-label="Front opening (%)"
                type="range"
                min="0"
                max="100"
                value={opening}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setOpening(value);
                  actions.current?.open(value);
                }}
              />
            </label>
            <button
              onClick={() => {
                setOpening(opening ? 0 : 100);
                actions.current?.open(opening ? 0 : 100);
              }}
            >
              {opening ? 'Close fronts' : 'Open fronts'}
            </button>{' '}
            <label>
              <input
                type="checkbox"
                checked={interiors}
                onChange={(e) => setInteriors(e.target.checked)}
              />{' '}
              Show interiors
            </label>
          </div>
        </details>
        <details className="render-menu">
          <summary>Compare materials</summary>
          <div className="render-menu-content designer-row">
            <p>
              Compare finishes from the same camera. Preview changes are
              temporary until applied.
            </p>
            <select
              aria-label="Material preview"
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
            >
              <option value="original">Original design</option>
              <option value="oak">Warm oak / quartz</option>
              <option value="white">Soft white / quartz</option>
              <option value="dark">Dark slate / marble</option>
            </select>
            <button
              disabled={variant === 'original'}
              onClick={() => setVariant('original')}
            >
              Show original
            </button>
            <button
              disabled={variant === 'original'}
              onClick={() => {
                onChange(design);
                setVariant('original');
              }}
            >
              Apply preview materials
            </button>
          </div>
        </details>
        <details className="render-menu">
          <summary>Export image</summary>
          <div className="render-menu-content designer-row">
            {' '}
            {onCapture && (
              <button
                disabled={!!error}
                onClick={() => actions.current?.save(1920, true)}
              >
                Capture presentation view
              </button>
            )}
            <label>
              PNG width
              <select
                aria-label="Render export width"
                value={exportWidth}
                onChange={(e) => setExportWidth(Number(e.target.value))}
              >
                <option value={1920}>1920 px</option>
                <option value={3840}>3840 px</option>
              </select>
            </label>
            <button
              onClick={() => actions.current?.save(exportWidth)}
              disabled={!!error}
            >
              Download PNG
            </button>
          </div>
        </details>
      </div>
      {walking && (
        <div className="walk-controls designer-row">
          <label>
            Walking speed
            <select
              aria-label="Walking speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={18}>Slow</option>
              <option value={30}>Normal</option>
              <option value={48}>Fast</option>
            </select>
          </label>
          <button onClick={() => actions.current?.walk(1, 0)}>
            Walk forward
          </button>
          <button onClick={() => actions.current?.walk(-1, 0)}>
            Walk back
          </button>
          <button onClick={() => actions.current?.walk(0, -1)}>
            Step left
          </button>
          <button onClick={() => actions.current?.walk(0, 1)}>
            Step right
          </button>
          <button onClick={() => actions.current?.walk(0, 0, 0.2)}>
            Look left
          </button>
          <button onClick={() => actions.current?.walk(0, 0, -0.2)}>
            Look right
          </button>
          <span>
            Drag to look. Focus the canvas and use WASD / arrow keys. Movement
            avoids cabinets, appliances and solid partitions. Door openings
            remain passable.
          </span>
        </div>
      )}
      {opening > 0 && (
        <p className="front-opening-note" role="status">
          Opening {selected ? 'selected cabinet' : 'all straight cabinet'}{' '}
          fronts: {opening}%. Corner fronts are fixed. Use Layout checks for
          installation clearance review.
        </p>
      )}
      {opening > 0 && (
        <div className="opening-conflicts" role="status">
          {conflicts.length ? (
            <ul>
              {conflicts.slice(0, 6).map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
          ) : (
            <p>
              No intersections with closed design objects detected. Approximate
              check; decorative stools, accessories and other moving fronts are
              not checked.
            </p>
          )}
        </div>
      )}
      <details className="camera-controls">
        <summary>Saved cameras</summary>
        <div className="designer-row">
          {closeupViews(design).map((view) => (
            <button key={view.id} onClick={() => actions.current?.load(view)}>
              {view.name}
            </button>
          ))}
        </div>
        <div className="designer-row">
          <input
            aria-label="Camera view name"
            value={viewName}
            maxLength={50}
            onChange={(e) => setViewName(e.target.value)}
          />
          <button
            disabled={
              (design.views?.length ?? 0) >= 8 || !viewName.trim() || !!error
            }
            onClick={() => {
              const camera = actions.current?.capture();
              if (camera)
                onChange({
                  ...sourceDesign,
                  views: [
                    ...(design.views ?? []),
                    {
                      ...camera,
                      id: crypto.randomUUID(),
                      name: viewName.trim(),
                    },
                  ],
                });
            }}
          >
            Save camera
          </button>
          <select
            aria-label="Saved camera views"
            value={viewId}
            onChange={(e) => {
              setViewId(e.target.value);
              const view = design.views?.find((v) => v.id === e.target.value);
              if (view) actions.current?.load(view);
            }}
          >
            <option value="">Choose camera</option>
            {design.views?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button
            disabled={!viewId}
            onClick={() => {
              onChange({
                ...sourceDesign,
                views: design.views?.filter((v) => v.id !== viewId),
              });
              setViewId('');
            }}
          >
            Delete camera
          </button>
        </div>
      </details>
      {error && <p role="alert">{error}</p>}
      <div className="render-stage" ref={host} />
      <p className="render-hint">
        Drag to orbit · Right-drag to pan · Scroll to zoom · Two fingers to
        pan/zoom
        <br />
        Illustrative materials and models; dimensions follow your design.
      </p>
    </div>
  );
}
