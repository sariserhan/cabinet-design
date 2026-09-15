'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { materialTexture } from './render-textures';
import { wallPanels, partitionPanels } from '@/designer/model';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Design } from '@/designer/model';
import {
  cutPanels,
  footprint,
  resolvedFront,
  sinkHoles,
} from '@/designer/model';
import {
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
  design,
  onChange,
  cameraView,
  onCamera,
  onCapture,
}: {
  cameraView?: CameraView;
  onCamera?: (view: CameraView) => void;
  onCapture?: (url: string) => void;
  design: Design;
  onChange: (design: Design) => void;
}) {
  const callbacks = useRef({ onCamera, onCapture });
  callbacks.current = { onCamera, onCapture };
  const externalCamera = useRef(cameraView);
  externalCamera.current = cameraView;
  const host = useRef<HTMLDivElement>(null);
  type View = NonNullable<Design['views']>[number];
  const actions = useRef<{
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
  } | null>(null);
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.setAttribute('aria-label', 'Rendered kitchen');
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer),
      environmentScene = new RoomEnvironment(),
      environment = pmrem.fromScene(environmentScene, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.45;
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
    } else fit();
    scene.add(
      new THREE.HemisphereLight(
        lighting === 'warm' ? '#ffdfb4' : '#ffffff',
        '#a39a8c',
        lighting === 'studio' ? 2 : 1.35,
      ),
    );
    const sun = new THREE.DirectionalLight(
      lighting === 'warm' ? '#ffcb91' : '#fff4dd',
      lighting === 'studio' ? 1.5 : 2.5,
    );
    sun.position.set(-size * 0.4, size * 2, size * 0.8);
    sun.target.position.set(design.room.width / 2, 0, design.room.depth / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
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
      lighting === 'studio' ? 1.8 : 0.6,
    );
    fillLight.position.set(size, size, -size);
    scene.add(fillLight);
    const textures = [
      materialTexture('wood'),
      materialTexture(design.appearance?.countertop ?? 'quartz'),
      materialTexture('floor'),
    ];

    const materials: THREE.Material[] = [];
    const material = (color: string, metalness = 0, roughness = 0.65) => {
      const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
      materials.push(m);
      return m;
    };
    const finish = material(
      { linen: '#ece7dc', oak: '#b88750', slate: '#414d57' }[design.finish],
    );
    const inset = material(
      { linen: '#d9d3c6', oak: '#a87947', slate: '#34404a' }[design.finish],
    );
    const stone = material('#eceae3', 0.05, 0.27),
      steel = material('#a9b0b3', 0.75, 0.25),
      dark = material('#20282d', 0.25, 0.26),
      wall = material('#f4f0e8');
    const glass = material('#729da9', 0.35, 0.15);
    if (design.finish === 'oak') {
      finish.color.set('#ffffff');
      inset.color.set('#ead5b5');
      finish.map = textures[0] ?? null;
      inset.map = textures[0] ?? null;
      finish.bumpMap = textures[0] ?? null;
      finish.bumpScale = 0.08;
    }
    stone.color.set('#ffffff');
    stone.map = textures[1] ?? null;
    stone.roughness = 0.23;
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
        new THREE.BoxGeometry(
          Math.max(0.01, w),
          Math.max(0.01, h),
          Math.max(0.01, d),
        ),
        m,
      );
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
      floorUV.setXY(i, floorUV.getX(i) / 96, floorUV.getY(i) / 96);
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
    for (const item of design.items) {
      const { width: w, height: h, depth: d } = item,
        f = footprint(item);
      const group = new THREE.Group();
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
        for (const p of cutPanels(w, d, sinkHoles(item, design.items)))
          b(
            p.width,
            thickness,
            p.height,
            p.x + p.width / 2 - w / 2,
            y,
            p.y + p.height / 2 - d / 2,
            stone,
          );
      };
      if (item.kind === 'countertop') {
        surface(h / 2, h);
        continue;
      }
      if (item.kind === 'sink') {
        b(w, 1, d, 0, 1, 0, steel);
        b(1, h, d, -w / 2 + 0.5, h / 2, 0, steel);
        b(1, h, d, w / 2 - 0.5, h / 2, 0, steel);
        b(w, h, 1, 0, h / 2, -d / 2 + 0.5, steel);
        b(w, h, 1, 0, h / 2, d / 2 - 0.5, steel);
        b(1, 9, 1, 0, h + 4, -d / 2 + 2, steel);
        b(1, 1, 7, 0, h + 8, -d / 2 + 5, steel);
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
          item.kind === 'window' ? glass : finish,
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
        b(1, h, d, -w / 2 + 0.5, h / 2, 0, finish);
        b(1, h, d - cut, w / 2 - 0.5, h / 2, -cut / 2, finish);
        b(w, h, 1, 0, h / 2, -d / 2 + 0.5, finish);
        if (diagonal) cornerShelf(1, finish);
        else b(w, 1, d, 0, 1, 0, finish);
        const toe =
          item.elevation === 0
            ? Math.min(item.details?.toeKick ?? 4, h - 1)
            : 0;
        if (toe) b(w - 2, toe, d - cut - 3, 0, toe / 2, -cut / 2 - 1.5, dark);
        const details = item.details ?? {
          shelves: 2,
          interior: 'shelves',
          molding: false,
        };
        for (let shelf = 1; shelf <= details.shelves; shelf++) {
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
        const style = resolvedFront(item),
          columns = style === 'double' ? 2 : 1,
          rows = style === 'drawers' ? 3 : 1;
        if (!interiors && item.kind !== 'corner')
          for (let col = 0; col < columns; col++)
            for (let row = 0; row < rows; row++) {
              const pw = w / columns - 0.6,
                ph = (h - toe) / rows - 0.6,
                x = -w / 2 + ((col + 0.5) * w) / columns,
                y = toe + ((row + 0.5) * (h - toe)) / rows;
              b(pw, ph, 1, x, y, d / 2, finish);
              b(
                Math.max(0.2, pw - 4),
                Math.max(0.2, ph - 4),
                0.2,
                x,
                y,
                d / 2 + 0.6,
                style === 'glass' ? glass : inset,
              );
              const hx =
                style === 'drawers'
                  ? x
                  : columns === 2
                    ? x + (col === 0 ? 1 : -1) * (pw / 2 - 2)
                    : x + (item.mirrored ? -1 : 1) * (pw / 2 - 2);
              b(
                style === 'drawers' ? 5 : 0.5,
                style === 'drawers' ? 0.5 : 5,
                0.8,
                hx,
                y + ph / 2 - 5,
                d / 2 + 1.2,
                steel,
              );
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
        if (item.kind === 'island') surface(h - 0.75, 1.5);
        else if (!diagonal && !sinkHoles(item, design.items).length)
          b(w, 0.6, d, 0, h - 0.3, 0, finish);
      } else {
        b(w, h, d, 0, h / 2, 0, steel);
        for (const x of [-w / 2 + 2, w / 2 - 2])
          b(2, 1.5, 2, x, 0.75, d / 2 - 2, dark);
        b(w - 2, 3, 0.7, 0, h - 2, d / 2 + 0.5, dark);
        for (let k = 0; k < 4; k++) {
          const knob = new THREE.Mesh(
            new THREE.CylinderGeometry(0.65, 0.65, 0.7, 20),
            steel,
          );
          knob.rotation.x = Math.PI / 2;
          knob.position.set(-w / 3 + (k * w) / 4, h - 2, d / 2 + 1);
          group.add(knob);
        }
        if (item.kind === 'refrigerator') {
          b(0.3, h * 0.7, 0.8, 0, h * 0.65, d / 2 + 0.5, dark);
          for (const x of [-1.7, 1.7])
            b(0.6, 14, 1.4, x, h * 0.65, d / 2 + 1.2, steel);
          b(7, 9, 0.7, -w / 4, h * 0.63, d / 2 + 0.8, dark);
        }

        if (item.kind === 'washing_machine') {
          const drum = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.32, w * 0.32, 1, 48),
            dark,
          );
          drum.rotation.x = Math.PI / 2;
          drum.position.set(0, h * 0.45, d / 2 + 0.7);
          group.add(drum);
        } else
          b(
            w - 3,
            h * 0.65,
            0.5,
            0,
            h * 0.45,
            d / 2 + 0.3,
            item.kind === 'refrigerator' ? steel : dark,
          );
        b(w - 5, 0.7, 1.5, 0, h - 5, d / 2 + 1, dark);
        if (item.kind === 'refrigerator')
          b(w, 0.3, 0.6, 0, h * 0.3, d / 2 + 0.5, dark);
        if (item.kind === 'range')
          for (const x of [-w / 4, w / 4])
            for (const z of [-d / 4, d / 4]) {
              const burner = new THREE.Mesh(
                new THREE.CylinderGeometry(4, 4, 0.4, 32),
                dark,
              );
              burner.position.set(x, h + 0.2, z);
              group.add(burner);
            }
      }
    }
    const render = () => {
      for (const w of walls)
        w.group.visible =
          !cutaway ||
          (camera.position.x - w.x) * w.nx + (camera.position.z - w.z) * w.nz >=
            0;
      renderer.render(scene, camera);
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
      fit,
      capture: () => ({
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
      }),
      load: (view) => {
        camera.position.set(...view.position);
        controls.target.set(...view.target);
        controls.update();
        render();
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
      };
      observer.disconnect();
      controls.dispose();
      actions.current = null;
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [design, cutaway, interiors, showCeiling]);
  return (
    <div className="designer-render">
      <div className="designer-row render-controls">
        <label>
          <input
            type="checkbox"
            checked={interiors}
            onChange={(e) => setInteriors(e.target.checked)}
          />{' '}
          Show interiors
        </label>
        <label>
          <input
            type="checkbox"
            checked={showCeiling}
            onChange={(e) => setShowCeiling(e.target.checked)}
          />{' '}
          Show ceiling
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
        <label>
          <input
            type="checkbox"
            checked={cutaway}
            onChange={(e) => setCutaway(e.target.checked)}
          />{' '}
          Cutaway walls
        </label>
      </div>
      <div className="camera-controls designer-row">
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
                ...design,
                views: [
                  ...(design.views ?? []),
                  { ...camera, id: crypto.randomUUID(), name: viewName.trim() },
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
              ...design,
              views: design.views?.filter((v) => v.id !== viewId),
            });
            setViewId('');
          }}
        >
          Delete camera
        </button>
      </div>
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
