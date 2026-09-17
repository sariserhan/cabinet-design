'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { setTextureAnisotropy } from './render-textures';
import { itemDimensionText } from '@/designer/dimension-overlay';
import type { DimensionAxes } from '@/designer/dimension-overlay';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { loadRenderAssets, type RenderAssets } from './render-assets';
import { createPalette } from './render-materials';
import {
  initialViewState,
  type UpdateView,
  type ViewState,
} from './render-state';
import { buildKitchenScene } from './render-scene';
import { equirectangularFromCube } from './render-probe';
import { toneCurve } from './render-tone';
import { RenderControls, type RenderActions } from './render-controls';
import { imageBalance } from '@/designer/image-quality';
import {
  environmentIntensity,
  type RenderSettings,
  type PresentationScene,
} from '@/designer/render-settings';
import { PresentationScenes } from './presentation-scenes';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  openingConflicts,
  walkPosition,
  walkEntry,
  materialVariant,
  panoramaViewpoint,
} from '@/designer/render-planning';
import { bestCamera } from '@/designer/experience';
import { SurfaceEditor, type SurfaceTarget } from './experience-tools';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { closeupViews } from '@/designer/refinements';
import { addWindowLighting } from './render-lighting';
import { photoSnapshot, renderPhoto } from './photo-render';
import { usePhotoExport } from './use-photo-export';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Lock, LockOpen } from 'lucide-react';
import { footprint } from '@/designer/model';
import type { Design } from '@/designer/model';

export type CameraView = {
  position: [number, number, number];
  target: [number, number, number];
};

/**
 * A rendered frame reduced to its final size.
 *
 * Drawing the oversized canvas into a smaller one averages each output pixel
 * from several rendered ones, which is what removes the stair-stepping from
 * an exported still. Falls back to the frame as rendered if a 2D context is
 * refused, since a larger image beats no image.
 */
function downsample(source: HTMLCanvasElement, width: number, height: number) {
  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d');
  if (!ctx) return source.toDataURL('image/png');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return target.toDataURL('image/png');
}

export default function RenderView({
  design: sourceDesign,
  ownerId,
  onChange,
  cameraView,
  onCamera,
  onCapture,
  selected,
  selectedIds,
  dimensions,
  onSelect,
  onToggle,
  onMoveItem,
  editLocked,
  onEditLockChange,
}: {
  ownerId?: string;
  selected?: string | null;
  selectedIds?: string[];
  /** Sizes drawn over the scene, and which of the three to draw. */
  dimensions?: { on: boolean; axes: DimensionAxes };
  onSelect?: (id: string | null) => void;
  onToggle?: (id: string) => void;
  /** Commits a drag in the 3D view, using the same rules as the 2D plan. */
  onMoveItem?: (id: string, x: number, y: number) => void;
  /** While locked, dragging is refused; clicking still selects. */
  editLocked?: boolean;
  /** Provided only where the lock is meant to be offered as a control. */
  onEditLockChange?: (locked: boolean) => void;
  cameraView?: CameraView;
  onCamera?: (view: CameraView) => void;
  onCapture?: (url: string) => void;
  design: Design;
  onChange: (design: Design) => void;
}) {
  const [surfaceTarget, setSurfaceTarget] = useState<{
    target: SurfaceTarget;
    itemId?: string;
  } | null>(null);
  // One object instead of seventeen hooks; see render-state.ts. Destructured so
  // the rest of this component still reads each field by name.
  const [view, setView] = useState<ViewState>(initialViewState);
  const update = useCallback<UpdateView>(
    (patch) => setView((current) => ({ ...current, ...patch })),
    [],
  );
  const {
    variant,
    lightingOverride,
    lightingProfileOverride,
    environmentKind,
    scanned,
    whiteBalance,
    autoBalance,
    adaptive,
    exportWidth,
    lens,
    exposure,
    quality,
    walking,
    opening,
    cutaway,
    interiors,
    showCeiling,
  } = view;
  const [assets, setAssets] = useState<RenderAssets | null>(null);
  const [assetError, setAssetError] = useState('');
  const whiteBalanceRef = useRef(whiteBalance);
  whiteBalanceRef.current = whiteBalance;
  const [sceneRevision, setSceneRevision] = useState(0);
  const sceneReady = useRef<((error?: Error) => void) | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  useEffect(() => {
    let live = true;
    loadRenderAssets()
      .then((a) => {
        if (live) setAssets(a);
      })
      .catch(() => {
        if (live)
          setAssetError(
            'Detailed assets could not load. Using generated materials and studio lighting.',
          );
      });
    return () => {
      live = false;
    };
  }, []);
  const assetsLoading = !assets && !assetError;

  const design = useMemo(() => {
    const preview = materialVariant(sourceDesign, variant);
    return lightingOverride
      ? {
          ...preview,
          appearance: {
            ...preview.appearance,
            countertop: preview.appearance?.countertop ?? 'quartz',
            lighting: lightingOverride,
            lightingProfile:
              lightingProfileOverride ??
              preview.appearance?.lightingProfile ??
              'day',
          },
        }
      : preview;
  }, [sourceDesign, variant, lightingOverride, lightingProfileOverride]);

  const [speed, setSpeed] = useState(30);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const callbacks = useRef({
    onCamera,
    onCapture,
    onSelect,
    onToggle,
    onMoveItem,
    editLocked,
  });
  callbacks.current = {
    onCamera,
    onCapture,
    onSelect,
    onToggle,
    onMoveItem,
    editLocked,
  };
  // Whether this machine can afford to refine a still view, learned from the
  // first attempt. Kept across scene rebuilds: the answer is about the
  // device, and re-testing it on every edit would cost a slow frame each
  // time on exactly the machines that cannot spare one.
  // Read inside the render loop, so toggling an axis does not rebuild the
  // scene to change a number.
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;
  const refineAllowed = useRef(true);
  const pendingCamera = useRef<CameraView | null>(null);
  const externalCamera = useRef(cameraView);
  externalCamera.current = cameraView;
  const host = useRef<HTMLDivElement>(null);
  const actions = useRef<RenderActions | null>(null);
  const [viewName, setViewName] = useState('Camera view'),
    [viewId, setViewId] = useState('');
  const cameraState = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    walking: boolean;
  } | null>(null);
  const lensRef = useRef(lens);
  lensRef.current = lens;
  useEffect(() => {
    actions.current?.lens(lens);
  }, [lens]);
  const {
    photoSamples,
    setPhotoSamples,
    photoDenoise,
    setPhotoDenoise,
    photoProgress,
    photoMessage,
    photoResult,
    photoJob,
    startPhoto,
  } = usePhotoExport({
    design,
    // Read at export time, once `settings` below has been assembled.
    describe: () => designVersion,
    actions,
    exportWidth,
    assets,
    environmentKind,
    whiteBalance,
    autoBalance,
    adaptive,
  });
  const exposureRef = useRef(exposure);
  exposureRef.current = exposure;
  useEffect(() => {
    actions.current?.refresh();
  }, [dimensions]);
  useEffect(() => {
    actions.current?.expose(exposure);
  }, [exposure]);
  useEffect(() => {
    actions.current?.balance(whiteBalance);
  }, [whiteBalance]);
  const conflicts = useMemo(
    () => openingConflicts(design, opening, selected),
    [design, opening, selected],
  );
  const openingRef = useRef(opening);
  openingRef.current = opening;
  const [error, setError] = useState('');
  const settings: RenderSettings = {
    lens,
    exposure,
    whiteBalance,
    environment: environmentKind,
    scanned,
    autoBalance,
    adaptive,
    denoise: photoDenoise,
    quality,
    ceiling: showCeiling,
    cutaway,
    variant: variant as RenderSettings['variant'],
    lighting: design.appearance?.lighting ?? 'daylight',
    lightingProfile: design.appearance?.lightingProfile ?? 'day',
    interiors,
    opening,
  };
  const designVersion = JSON.stringify({ design, settings });
  const captureScene = (): Omit<PresentationScene, 'id' | 'name'> | null => {
    const camera = actions.current?.capture();
    return camera ? { ...camera, settings } : null;
  };
  const applyScene = (scene: PresentationScene) => {
    pendingCamera.current = scene;
    const v = scene.settings;
    update({ lens: v.lens });
    update({ exposure: v.exposure });
    update({ whiteBalance: v.whiteBalance });
    update({ environmentKind: v.environment });
    update({ scanned: v.scanned });
    update({ autoBalance: v.autoBalance });
    update({ adaptive: v.adaptive });
    setPhotoDenoise(v.denoise);
    update({ quality: v.quality });
    update({ showCeiling: v.ceiling });
    update({ cutaway: v.cutaway });
    update({ variant: v.variant });
    update({ lightingOverride: v.lighting });
    update({ lightingProfileOverride: v.lightingProfile });
    update({ interiors: v.interiors });
    update({ walking: false });
    update({ opening: v.opening });
    setSceneRevision((n) => n + 1);
  };
  const renderSavedScene = async (
    scene: PresentationScene,
    signal: AbortSignal,
    preview: boolean,
    onStatus: (message: string) => void,
  ) => {
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        sceneReady.current = null;
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      signal.throwIfAborted();
      signal.addEventListener('abort', cancel, { once: true });
      sceneReady.current = (error) => {
        signal.removeEventListener('abort', cancel);
        if (error) reject(error);
        else resolve();
      };
      applyScene(scene);
    });
    signal.throwIfAborted();
    const captured = actions.current?.snapshot();
    if (!captured) throw Error('Renderer is unavailable.');
    return renderPhoto(captured.snapshot, captured.camera, {
      width: preview ? 640 : Math.min(exportWidth, 1920),
      samples: preview ? 8 : photoSamples,
      exposure: scene.settings.exposure,
      whiteBalance: scene.settings.whiteBalance,
      environment: assets ? scene.settings.environment : 'studio',
      autoBalance: scene.settings.autoBalance,
      adaptive: scene.settings.adaptive,
      denoise: scene.settings.denoise,
      signal,
      onProgress: (n) =>
        onStatus(
          `Rendering ${Math.round((100 * n) / (preview ? 8 : photoSamples))}%`,
        ),
      onStatus,
    });
  };
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
      sceneReady.current?.(
        new Error(
          'Renderer could not start. Enable hardware acceleration or reopen Render.',
        ),
      );
      sceneReady.current = null;
      setError(
        'Rendering requires WebGL2. Enable hardware acceleration in your browser, or use 3D preview.',
      );
      return;
    }
    setError('');
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // Grazing angles are most of a kitchen view - the floor, the worktops -
    // and that is exactly where a low anisotropy limit smears a texture.
    setTextureAnisotropy(renderer.capabilities.getMaxAnisotropy());
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = quality ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    renderer.toneMapping = toneCurve;
    renderer.toneMappingExposure = exposureRef.current;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', 'Rendered kitchen');
    container.appendChild(renderer.domElement);
    // Sizes are HTML over the canvas rather than geometry in the scene:
    // text in a scene has to be re-made whenever it changes, and would be
    // lit and occluded like everything else in it.
    const labelLayer = document.createElement('div');
    labelLayer.className = 'render-dimensions';
    container.appendChild(labelLayer);
    const labelNodes = new Map<string, HTMLSpanElement>();
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer),
      environmentScene = new RoomEnvironment(),
      environment =
        assets && environmentKind === 'garden'
          ? pmrem.fromEquirectangular(assets.sky)
          : pmrem.fromScene(environmentScene, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = environmentIntensity(
      design.appearance?.lightingProfile,
    );
    environmentScene.dispose();
    pmrem.dispose();
    const lighting = design.appearance?.lighting ?? 'daylight';
    scene.background = new THREE.Color(
      lighting === 'warm' ? '#e8dfd3' : '#e8e9e7',
    );
    if (assets && environmentKind === 'garden') {
      scene.background = assets.sky;
      scene.backgroundBlurriness = 0.06;
    }
    const size = Math.max(
      design.room.width,
      design.room.depth,
      design.room.height,
    );
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, size * 30);
    camera.setFocalLength(lensRef.current);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2;
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
    if (pendingCamera.current) {
      camera.position.set(...pendingCamera.current.position);
      controls.target.set(...pendingCamera.current.target);
      pendingCamera.current = null;
      controls.update();
    } else if (externalCamera.current) {
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
              : 0.28,
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
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.00005;
    sun.shadow.radius = quality ? 4 : 2;
    sun.shadow.blurSamples = 8;
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
    addWindowLighting(scene, design, sun);
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
    const palette = createPalette({ design, assets, scanned });
    const { textures, materials } = palette;
    const { walls, itemGroups, surfaceObjects, roomReflection, movingFronts } =
      buildKitchenScene({
        ...palette,
        renderer,
        scene,
        design,
        settings,
        size,
        assets,
        interiors,
        showCeiling,
        quality,
        selected,
        selectedIds,
        openingRef,
      });
    // EffectComposer's own render target has no multisampling, so the
    // renderer's antialias flag stops meaning anything the moment a pass
    // runs - and one always does. Without this every cabinet edge, window
    // bar and worktop line in the view is a visible staircase.
    const drawing = renderer.getDrawingBufferSize(new THREE.Vector2());
    const composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(drawing.x, drawing.y, {
        type: THREE.HalfFloatType,
        samples: 4,
      }),
    );
    // Ground contact is what stops cabinets looking like they float. GTAO
    // reads the room's own depth and normals rather than SSAO's screen-space
    // guess, and its radius is in world units - inches here, so a quarter of
    // an inch of shading would be invisible in a room this size.
    const ao = quality ? new GTAOPass(scene, camera, 512, 512) : null;
    ao?.updateGtaoMaterial({
      radius: 8,
      thickness: 4,
      distanceExponent: 1,
      scale: 1,
      samples: 16,
      screenSpaceRadius: false,
    });
    const output = new OutputPass();
    const balancePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        whiteBalance: { value: new THREE.Vector3(...whiteBalanceRef.current) },
      },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'uniform sampler2D tDiffuse;uniform vec3 whiteBalance;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);gl_FragColor=vec4(c.rgb*whiteBalance,c.a);}',
    });
    // Two ways to draw the scene, one enabled at a time. While anything is
    // moving, the plain pass into the multisampled target keeps the view
    // crisp for the cost of one frame. Once the camera settles, the TAA pass
    // takes over and accumulates jittered samples of the same still frame,
    // which resolves edges and contact shading far past what one sample can
    // - and costs nothing while someone is actually working.
    const renderPass = new RenderPass(scene, camera);
    const settlePass = new TAARenderPass(scene, camera);
    settlePass.unbiased = false;
    settlePass.sampleLevel = 2;
    settlePass.enabled = false;
    // The pass documents this counter and drives its own behaviour from it,
    // but the published types leave it out. It has to be readable here: a
    // stale index makes the pass hand back the image it accumulated for a
    // camera that has since moved.
    const settleState = settlePass as TAARenderPass & {
      accumulateIndex: number;
    };
    composer.addPass(renderPass);
    composer.addPass(settlePass);
    if (ao) composer.addPass(ao);
    composer.addPass(balancePass);
    composer.addPass(output);
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
      // Nothing has changed for a moment, so spend the idle frames refining
      // the one on screen. Each pass adds four jittered samples; at the full
      // set of 32 the image stops improving and accumulating stops with it.
      if (
        !cameraTween &&
        !(walking && held.size) &&
        settleAfter &&
        now >= settleAfter &&
        canRefine()
      ) {
        if (refinedAt && now - refinedAt > 150) {
          refineAllowed.current = false;
          settleAfter = 0;
        } else if (!settling) {
          settling = true;
          settlePass.enabled = true;
          settlePass.accumulate = true;
          renderPass.enabled = false;
          // Refining is worth a couple of seconds and no more. A fast
          // machine finishes the whole set inside that; a slow one - or
          // software rendering, where a single frame can take seconds -
          // takes what it can and gives the main thread back rather than
          // locking the workspace up for a better-looking still frame.
          settleUntil = now + 2000;
        }
        if (
          canRefine() &&
          settleState.accumulateIndex < 32 &&
          now < settleUntil
        ) {
          refinedAt = now;
          composer.render();
        } else settleAfter = 0;
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
    /**
     * Dragging an item in 3D.
     *
     * The pointer moves over a picture of the room, so "where is this now" has
     * to be asked of a surface rather than of the screen. The item is dragged
     * across a horizontal plane at its own base height: for a floor cabinet
     * that is the floor, and for a wall cabinet the plane it already hangs on,
     * so dragging never changes an item's elevation.
     *
     * Orbit and drag both start as a press on the canvas, so the drag only
     * takes over once the pointer has travelled far enough to mean it, and it
     * releases the camera controls for as long as it lasts.
     */
    const dragPlane = new THREE.Plane();
    const dragPoint = new THREE.Vector3();
    let drag: {
      id: string;
      group: THREE.Object3D;
      offset: THREE.Vector3;
      pointerId: number;
    } | null = null;
    const pickAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          (-(clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      return ray;
    };
    const pointerDown = (e: PointerEvent) => {
      press = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
      if (
        walking ||
        e.button !== 0 ||
        !callbacks.current.onMoveItem ||
        callbacks.current.editLocked
      )
        return;
      const hit = pickAt(e.clientX, e.clientY)
        .intersectObjects(itemGroups, true)
        .find((h) => {
          let o: THREE.Object3D | null = h.object;
          while (o) {
            if (!o.visible) return false;
            o = o.parent;
          }
          return true;
        });
      let owner: THREE.Object3D | null = hit?.object ?? null;
      while (owner && !owner.userData.itemId) owner = owner.parent;
      const id = owner?.userData.itemId as string | undefined;
      const item = id ? design.items.find((i) => i.id === id) : undefined;
      if (!hit || !owner || !item || item.locked) return;
      dragPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, owner.position.y, 0),
      );
      // Where the item sits relative to the grab point, so it does not jump.
      if (
        !pickAt(e.clientX, e.clientY).ray.intersectPlane(dragPlane, dragPoint)
      )
        return;
      drag = {
        id: item.id,
        group: owner,
        offset: owner.position.clone().sub(dragPoint),
        pointerId: e.pointerId,
      };
    };
    const dragMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= 5)
        return;
      if (controls.enabled) {
        controls.enabled = false;
        renderer.domElement.setPointerCapture(e.pointerId);
      }
      if (
        !pickAt(e.clientX, e.clientY).ray.intersectPlane(dragPlane, dragPoint)
      )
        return;
      drag.group.position.x = dragPoint.x + drag.offset.x;
      drag.group.position.z = dragPoint.z + drag.offset.z;
      render();
    };
    const dragEnd = (e: PointerEvent) => {
      if (!drag) return;
      const finished = drag;
      drag = null;
      if (controls.enabled) return;
      controls.enabled = true;
      if (renderer.domElement.hasPointerCapture(e.pointerId))
        renderer.domElement.releasePointerCapture(e.pointerId);
      const item = design.items.find((i) => i.id === finished.id);
      if (!item) return;
      // The scene places a group at the middle of the item's footprint, so the
      // stored corner is that centre less half the footprint.
      const f = footprint(item);
      callbacks.current.onMoveItem?.(
        finished.id,
        finished.group.position.x - f.width / 2,
        finished.group.position.z - f.depth / 2,
      );
      // A refused move leaves the group where the pointer left it; the rebuild
      // that follows any accepted change puts every group back where the design
      // says it is.
      press = null;
    };
    renderer.domElement.addEventListener('pointermove', dragMove);
    renderer.domElement.addEventListener('pointerup', dragEnd);
    renderer.domElement.addEventListener('pointercancel', dragEnd);
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
      const hit = ray
        .intersectObjects([...itemGroups, ...surfaceObjects], true)
        .find((h) => {
          let o: THREE.Object3D | null = h.object;
          while (o) {
            if (!o.visible) return false;
            o = o.parent;
          }
          return true;
        });
      let object: THREE.Object3D | null = hit?.object ?? null;
      while (object && !object.userData.itemId && !object.userData.surface)
        object = object.parent;
      let owner: THREE.Object3D | null = object;
      while (owner && !owner.userData.itemId) owner = owner.parent;
      const id = owner?.userData.itemId as string | undefined;
      const item = design.items.find((i) => i.id === id);
      // Shift adds the item to the selection rather than replacing it, the
      // same gesture as the plan, so a group can be built while orbiting.
      if (e.shiftKey && id && callbacks.current.onToggle) {
        callbacks.current.onToggle(id);
        return;
      }
      if (callbacks.current.onSelect) {
        const target =
          object?.userData.surface ??
          (item?.kind === 'countertop'
            ? 'countertop'
            : item &&
                ['cabinet', 'custom_cabinet', 'island', 'corner'].includes(
                  item.kind,
                )
              ? 'cabinet'
              : null);
        setSurfaceTarget(target ? { target, itemId: id } : null);
      }
      callbacks.current.onSelect?.(id ?? null);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    // Frames the settle pass has already accumulated, and when it may start.
    // Anything that changes the picture resets both: an accumulation of a
    // view that no longer exists would show as a smear.
    let settleAfter = 0,
      settling = false,
      settleUntil = 0,
      refinedAt = 0;
    // Refining a still view is only worth doing where drawing is cheap.
    // On software rendering one frame of this scene can cost the better
    // part of a second, and spending more of them on a slightly cleaner
    // picture would make the workspace feel stuck every time the pointer
    // stopped. Timing the render call itself does not show this - WebGL
    // returns as soon as the work is queued - so the gap between two
    // animation frames is what gets measured, and a device that fails it is
    // not asked again.
    const canRefine = () => refineAllowed.current;
    const render = () => {
      if (settling) {
        settling = false;
        settlePass.enabled = false;
        settlePass.accumulate = false;
        settleState.accumulateIndex = -1;
        renderPass.enabled = true;
      }
      // Only the gap between two consecutive refinement frames says anything
      // about what this device can afford; a gap that spans an edit does not.
      refinedAt = 0;
      settleAfter = performance.now() + 220;
      for (const w of walls)
        w.group.visible =
          !cutaway ||
          (camera.position.x - w.x) * w.nx + (camera.position.z - w.z) * w.nz >=
            0;
      if (composer) {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        if (size.x !== postWidth || size.y !== postHeight) {
          postWidth = size.x;
          postHeight = size.y;
          composer.setPixelRatio(1);
          composer.setSize(size.x, size.y);
          const scale = Math.min(1, 1280 / Math.max(size.x, size.y));
          ao?.setSize(
            Math.max(1, Math.round(size.x * scale)),
            Math.max(1, Math.round(size.y * scale)),
          );
        }
        composer.render();
      } else renderer.render(scene, camera);
      drawDimensions();
    };
    const projected = new THREE.Vector3();
    /** Put a size over the top centre of each item, or clear them away. */
    const drawDimensions = () => {
      const settings = dimensionsRef.current;
      const size = renderer.getSize(new THREE.Vector2());
      const wanted = new Set<string>();
      // Two labels on one spot read as neither, so each that would land on
      // a placed one rises above it, and none goes off the edge.
      const taken: { x: number; y: number }[] = [];
      if (settings?.on)
        for (const item of design.items) {
          if (item.hidden) continue;
          const label = itemDimensionText(item, settings.axes);
          if (!label) continue;
          const f = footprint(item);
          projected
            .set(
              item.x + f.width / 2,
              item.elevation + item.height,
              item.y + f.depth / 2,
            )
            .project(camera);
          // Behind the camera, so there is nothing to label.
          if (projected.z > 1) continue;
          wanted.add(item.id);
          let node = labelNodes.get(item.id);
          if (!node) {
            node = document.createElement('span');
            labelLayer.appendChild(node);
            labelNodes.set(item.id, node);
          }
          node.textContent = label;
          const x = Math.min(
            Math.max((projected.x * 0.5 + 0.5) * size.x, 60),
            size.x - 60,
          );
          let y = (-projected.y * 0.5 + 0.5) * size.y;
          for (
            let tries = 0;
            tries < 8 &&
            taken.some((t) => Math.abs(t.x - x) < 90 && Math.abs(t.y - y) < 15);
            tries++
          )
            y -= 15;
          taken.push({ x, y });
          node.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      for (const [id, node] of labelNodes)
        if (!wanted.has(id)) {
          node.remove();
          labelNodes.delete(id);
        }
    };
    controls.addEventListener('change', render);
    const resize = () => {
      const width = container.clientWidth,
        height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.setFocalLength(lensRef.current);
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
      balance: (value) => {
        balancePass.uniforms.whiteBalance?.value.set(...value);
        render();
      },
      meter: () => {
        render();
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        if (!context) return { exposure: 1, whiteBalance: [1, 1, 1] };
        context.drawImage(renderer.domElement, 0, 0, 64, 64);
        return imageBalance(context.getImageData(0, 0, 64, 64).data);
      },
      lens: (value) => {
        camera.setFocalLength(value);
        camera.updateProjectionMatrix();
        render();
      },
      snapshot: () => {
        render();
        return {
          snapshot: photoSnapshot(scene),
          camera: camera.clone(),
          exposure: renderer.toneMappingExposure,
        };
      },
      expose: (value) => {
        renderer.toneMappingExposure = value;
        render();
      },
      walk: step,
      open: (amount) => {
        targetOpening = amount;
      },
      fit,
      refresh: () => render(),
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
      /**
       * A 360 panorama, taken standing inside the room.
       *
       * Six faces are rendered around the camera and resampled into one
       * equirectangular image, which is what a viewer on a phone or a
       * client's browser expects. Byte targets rather than half-float,
       * for the same reason the room probe uses them.
       */
      panorama: (width: number) => {
        const height = Math.round(width / 2);
        // A face at the full height of the strip is twice what the equator
        // needs, so every output pixel is an average rather than a sample.
        const cube = new THREE.WebGLCubeRenderTarget(
          Math.min(renderer.capabilities.maxTextureSize, Math.max(256, height)),
          { type: THREE.UnsignedByteType },
        );
        const capture = new THREE.CubeCamera(0.5, 4000, cube);
        const oldSize = renderer.getSize(new THREE.Vector2()),
          oldRatio = renderer.getPixelRatio();
        try {
          // Stand in the kitchen, not wherever the orbit camera happens to
          // be parked: a panorama taken from the garden is a picture of the
          // garden with a kitchen in the middle of it.
          const standing = panoramaViewpoint(design);
          capture.position.copy(
            standing ? new THREE.Vector3(...standing) : camera.position,
          );
          capture.update(renderer, scene);
          // Drawn to the canvas rather than to a target, so the renderer
          // tone maps and encodes it the way it does the view on screen.
          renderer.setPixelRatio(1);
          renderer.setSize(width, height, false);
          equirectangularFromCube(
            renderer,
            cube.texture,
            null,
            whiteBalanceRef.current,
          );
          const link = document.createElement('a');
          link.download = `${design.name.replace(/[^a-z0-9-]/gi, '-').slice(0, 80) || 'kitchen'}-360.png`;
          link.href = renderer.domElement.toDataURL('image/png');
          link.click();
        } catch {
          setError('Panorama export failed. Try reopening Render.');
        } finally {
          cube.dispose();
          renderer.setPixelRatio(oldRatio);
          renderer.setSize(oldSize.x, oldSize.y, false);
          render();
        }
      },
      save: (width, captureOnly = false) => {
        const oldSize = renderer.getSize(new THREE.Vector2()),
          oldRatio = renderer.getPixelRatio();
        try {
          const height = Math.round(width / camera.aspect);
          // Render twice the asked-for size and average it down. The extra
          // samples land on the edges a client actually looks at, and the
          // image costs one frame either way. Above 1920 the request is
          // already beyond any screen, and doubling it risks the device's
          // texture limit, so it is taken at face value.
          const scale =
            width <= 1920 && width * 2 <= renderer.capabilities.maxTextureSize
              ? 2
              : 1;
          renderer.setPixelRatio(1);
          renderer.setSize(width * scale, height * scale, false);
          render();
          const link = document.createElement('a');
          link.download = `${design.name.replace(/[^a-z0-9-]/gi, '-').slice(0, 80) || 'kitchen'}-render.png`;
          link.href =
            scale === 1
              ? renderer.domElement.toDataURL('image/png')
              : downsample(renderer.domElement, width, height);
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
    sceneReady.current?.();
    sceneReady.current = null;
    return () => {
      photoJob.current?.abort();
      roomReflection?.dispose();
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
      renderer.domElement.removeEventListener('pointermove', dragMove);
      renderer.domElement.removeEventListener('pointerup', dragEnd);
      renderer.domElement.removeEventListener('pointercancel', dragEnd);
      renderer.domElement.removeEventListener('pointerdown', lookDown);
      renderer.domElement.removeEventListener('pointermove', lookMove);
      renderer.domElement.removeEventListener('pointerup', lookEnd);
      renderer.domElement.removeEventListener('pointercancel', lookEnd);
      labelLayer.remove();
      labelNodes.clear();
      ao?.dispose();
      settlePass.dispose();
      renderPass.dispose();
      output?.dispose();
      balancePass.dispose();
      composer?.dispose();
      controls.dispose();
      actions.current = null;
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      scene.traverse((object) => {
        if (
          object instanceof THREE.DirectionalLight ||
          object instanceof THREE.PointLight ||
          object instanceof THREE.SpotLight
        )
          object.shadow.dispose();
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
    assets,
    environmentKind,
    scanned,
    sceneRevision,
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
      {assetsLoading && (
        <p role="status">Loading detailed materials and outdoor lighting…</p>
      )}
      {assetError && <p role="status">{assetError}</p>}
      {ownerId && (
        <PresentationScenes
          key={`${ownerId}:${design.id}`}
          ownerId={ownerId}
          designId={design.id}
          sourceVersion={JSON.stringify(sourceDesign)}
          capture={captureScene}
          apply={applyScene}
          renderScene={renderSavedScene}
          onBusy={setBatchBusy}
          disabled={assetsLoading || !!error || photoProgress !== null}
        />
      )}
      <fieldset
        disabled={batchBusy}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {onSelect && (
          <p className="render-edit-hint">
            Click a cabinet, worktop, floor or backsplash to change its finish.
          </p>
        )}
        {surfaceTarget && onSelect && (
          <SurfaceEditor
            design={sourceDesign}
            {...surfaceTarget}
            onChange={onChange}
            onClose={() => setSurfaceTarget(null)}
          />
        )}
        <div className="render-quick-actions designer-row">
          <button
            onClick={() => {
              update({ walking: false });
              update({ cutaway: true });
              update({ showCeiling: false });
              const v = bestCamera(design);
              if (walking || !cutaway || showCeiling) pendingCamera.current = v;
              actions.current?.load(v);
              callbacks.current.onCamera?.(v);
            }}
          >
            Best kitchen view
          </button>
          <button
            onClick={() => {
              const v = closeupViews(design)[0];
              if (v) {
                if (walking) pendingCamera.current = v;
                update({ walking: false });
                actions.current?.load(v);
                callbacks.current.onCamera?.(v);
              }
            }}
          >
            Worktop close-up
          </button>
          <button
            onClick={() => {
              update({ opening: opening ? 0 : 100 });
              actions.current?.open(opening ? 0 : 100);
            }}
          >
            {opening ? 'Close doors & drawers' : 'Open doors & drawers'}
          </button>
        </div>
        <RenderControls
          view={view}
          update={update}
          actions={actions}
          photoJob={photoJob}
          design={design}
          designVersion={designVersion}
          assetsLoading={assetsLoading}
          error={error}
          startPhoto={startPhoto}
          onChange={onChange}
          onCamera={onCamera}
          onCapture={onCapture}
          photoDenoise={photoDenoise}
          setPhotoDenoise={setPhotoDenoise}
          photoMessage={photoMessage}
          photoProgress={photoProgress}
          photoResult={photoResult}
          photoSamples={photoSamples}
          setPhotoSamples={setPhotoSamples}
        />
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
            Opening {selected ? 'selected object' : 'cabinet and refrigerator'}{' '}
            fronts: {opening}%. Refrigerator doors are included; corner fronts
            are fixed. Use Layout checks for installation clearance review.
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
                No intersections with closed design objects detected.
                Approximate check; decorative stools, accessories and other
                moving fronts are not checked.
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
        <div
          className="render-stage"
          ref={host}
          style={batchBusy ? { pointerEvents: 'none' } : undefined}
        />
        {onEditLockChange ? (
          <p className="render-lock">
            <button
              type="button"
              aria-pressed={!editLocked}
              onClick={() => onEditLockChange(!editLocked)}
            >
              {editLocked ? (
                <>
                  <Lock size={14} /> Items locked
                </>
              ) : (
                <>
                  <LockOpen size={14} /> Items editable
                </>
              )}
            </button>
            <span>
              {editLocked
                ? 'Clicking still selects, so finishes can be changed. Unlock to move items here.'
                : 'Dragging and the item shortcuts are live in this view.'}
            </span>
          </p>
        ) : null}
        <p className="render-hint">
          Drag to orbit · Right-drag to pan · Scroll to zoom · Two fingers to
          pan/zoom
          {onMoveItem && !editLocked ? (
            <>
              <br />
              Drag a cabinet to move it on its own level · Arrow keys nudge 1
              in, Shift 6 in · R rotates 90°, Shift+R 180° · Delete removes
            </>
          ) : null}
          <br />
          Illustrative materials and models; dimensions follow your design.
        </p>
      </fieldset>
    </div>
  );
}
