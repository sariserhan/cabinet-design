import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { normalFromHeight } from './render-normal-map';

/** Own the snapshot so editing or unmounting cannot change an in-flight image. */
export function photoSnapshot(source: THREE.Scene) {
  const scene = source.clone();
  const geometry = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const textures = new Map<THREE.Texture, THREE.Texture>();
  const normalMaps: THREE.Texture[] = [];
  const copyMaterial = (original: THREE.Material) => {
    const cached = materials.get(original);
    if (cached) return cached;
    const material = original.clone();
    materials.set(original, material);
    for (const key of Object.keys(material)) {
      const record = material as unknown as Record<string, unknown>;
      const value = record[key];
      if (value instanceof THREE.Texture) {
        if (key === 'envMap') {
          record[key] = null;
          continue;
        }
        let texture = textures.get(value);
        if (!texture) {
          texture = value.clone();
          texture.needsUpdate = true;
          textures.set(value, texture);
        }
        record[key] = texture;
      }
    }
    if (
      material instanceof THREE.MeshStandardMaterial &&
      material.bumpMap &&
      !material.normalMap
    ) {
      const normal = normalFromHeight(
        material.bumpMap,
        material.bumpScale,
        material.userData.textureInches as [number, number] | undefined,
      );
      if (normal) {
        material.normalMap = normal;
        material.bumpMap = null;
        normalMaps.push(normal);
      }
    }
    return material;
  };
  const prune = (parent: THREE.Object3D) => {
    for (const child of [...parent.children]) {
      if (
        !child.visible ||
        child instanceof THREE.Line ||
        child instanceof THREE.HemisphereLight
      ) {
        parent.remove(child);
        continue;
      }
      if (child instanceof THREE.Mesh) {
        let g = geometry.get(child.geometry);
        if (!g) {
          g = child.geometry.clone() as THREE.BufferGeometry;
          geometry.set(child.geometry, g);
        }
        child.geometry = g;
        child.material = Array.isArray(child.material)
          ? child.material.map(copyMaterial)
          : copyMaterial(child.material);
      }
      prune(child);
    }
  };
  prune(scene);
  scene.environment = null;
  scene.updateMatrixWorld(true);
  return {
    scene,
    dispose: () => {
      geometry.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      normalMaps.forEach((t) => t.dispose());
    },
  };
}

export async function renderPhoto(
  snapshot: ReturnType<typeof photoSnapshot>,
  camera: THREE.PerspectiveCamera,
  options: {
    width: number;
    samples: number;
    exposure: number;
    denoise?: boolean;
    signal: AbortSignal;
    onProgress: (samples: number) => void;
  },
) {
  let renderer: THREE.WebGLRenderer | undefined;
  let tracer: import('three-gpu-pathtracer').WebGLPathTracer | undefined;
  let sky: THREE.Texture | undefined;
  const check = () => options.signal.throwIfAborted();
  try {
    check();
    const { WebGLPathTracer, GradientEquirectTexture, DenoiseMaterial } =
      await import('three-gpu-pathtracer');
    check();
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!renderer.extensions.has('EXT_color_buffer_float'))
      throw new Error(
        'Photo rendering needs floating-point WebGL support. Use Download PNG on this device.',
      );
    const height = Math.max(1, Math.round(options.width / camera.aspect));
    if (Math.max(options.width, height) > renderer.capabilities.maxTextureSize)
      throw new Error(
        'This image exceeds the device size limit. Choose a smaller PNG width or a wider camera view.',
      );
    renderer.setPixelRatio(1);
    renderer.setSize(
      options.width,
      Math.max(1, Math.round(options.width / camera.aspect)),
      false,
    );
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = options.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const gradient = new GradientEquirectTexture(128);
    gradient.topColor.set('#e2edff');
    gradient.bottomColor.set('#9c8f7c');
    gradient.update();
    sky = gradient;
    snapshot.scene.environment = sky;
    tracer = new WebGLPathTracer(renderer);
    tracer.textureSize.set(512, 512);
    tracer.bounces = 6;
    tracer.transmissiveBounces = 8;
    tracer.filterGlossyFactor = 0.5;
    tracer.tiles.set(3, 3);
    tracer.renderDelay = 0;
    tracer.fadeDuration = 0;
    tracer.minSamples = 1;
    tracer.rasterizeScene = false;
    tracer.setScene(snapshot.scene, camera);
    let previous = -1;
    while (tracer.samples < options.samples) {
      check();
      if (renderer.getContext().isContextLost())
        throw new Error(
          'The graphics device reset. Try a smaller photo width.',
        );
      tracer.renderSample();
      const sample = Math.floor(tracer.samples);
      if (sample !== previous) {
        options.onProgress(sample);
        previous = sample;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    check();
    if (options.denoise !== false) {
      const material = new DenoiseMaterial({
        map: tracer.target.texture,
        sigma: 3,
        kSigma: 1,
        threshold: 0.08,
      });
      const quad = new FullScreenQuad(material);
      try {
        renderer.setRenderTarget(null);
        renderer.setViewport(0, 0, options.width, height);
        renderer.setScissorTest(false);
        quad.render(renderer);
      } finally {
        material.dispose();
        quad.dispose();
      }
    }
    return renderer.domElement.toDataURL('image/png');
  } finally {
    tracer?.dispose();
    sky?.dispose();
    snapshot.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
