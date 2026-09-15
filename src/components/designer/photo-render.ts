import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { imageBalance, noisyRegions } from '@/designer/image-quality';
import { loadRenderAssets } from './render-assets';
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
    environment?: 'garden' | 'studio';
    whiteBalance?: [number, number, number];
    autoBalance?: boolean;
    adaptive?: boolean;
    onStatus?: (message: string) => void;
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
    sky =
      options.environment === 'garden'
        ? (await loadRenderAssets()).sky.clone()
        : gradient;
    if (sky !== gradient) gradient.dispose();
    check();
    if (options.environment === 'garden') snapshot.scene.background = sky;
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
    const output = document.createElement('canvas');
    output.width = options.width;
    output.height = height;
    const context = output.getContext('2d');
    const meter = document.createElement('canvas');
    meter.width = 64;
    meter.height = 64;
    const meterContext = meter.getContext('2d', { willReadFrequently: true });
    if (!context || !meterContext) throw Error('Cannot create photo image.');
    const balance = new THREE.Vector3(...(options.whiteBalance ?? [1, 1, 1]));
    const material = new DenoiseMaterial({
      map: tracer.target.texture,
      sigma: 3,
      kSigma: options.denoise === false ? 0 : 1,
      threshold: Math.max(
        0.1,
        Math.min(0.4, 0.2 * Math.sqrt(32 / options.samples)),
      ),
    });
    material.uniforms.whiteBalance = { value: balance };
    material.fragmentShader =
      'uniform vec3 whiteBalance;\n' +
      material.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        'gl_FragColor.rgb *= whiteBalance;\n#include <tonemapping_fragment>',
      );
    const quad = new FullScreenQuad(material);
    const activeRenderer = renderer,
      activeTracer = tracer;
    const finish = () => {
      if (material.uniforms.map)
        material.uniforms.map.value = activeTracer.target.texture;
      activeRenderer.setRenderTarget(null);
      activeRenderer.setScissorTest(false);
      const size = activeRenderer.getSize(new THREE.Vector2());
      activeRenderer.setViewport(0, 0, size.x, size.y);
      quad.render(activeRenderer);
    };
    const pixels = () => {
      // Measure temporal change before filtering so the denoiser cannot hide noise.
      const kernel = material.uniforms.kSigma;
      const previousKernel = kernel?.value;
      if (kernel) kernel.value = 0;
      finish();
      if (kernel) kernel.value = previousKernel;
      meterContext.drawImage(activeRenderer.domElement, 0, 0, 64, 64);
      return meterContext.getImageData(0, 0, 64, 64).data;
    };
    const sampleTo = async (target: number, progress: (n: number) => void) => {
      let previous = -1;
      while (activeTracer.samples < target) {
        check();
        if (activeRenderer.getContext().isContextLost())
          throw Error('The graphics device reset. Try a smaller photo width.');
        activeTracer.renderSample();
        const n = Math.floor(activeTracer.samples);
        if (n !== previous) {
          progress(n);
          previous = n;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      check();
    };
    try {
      // Compare progressive estimates, not spatial texture detail, to locate noise.
      const base = options.adaptive
        ? Math.min(options.samples, Math.max(4, Math.ceil(options.samples / 2)))
        : options.samples;
      await sampleTo(Math.max(2, Math.floor(base / 2)), (n) =>
        options.onProgress(n * 0.5),
      );
      const before = pixels();
      await sampleTo(base, (n) => options.onProgress(n * 0.5));
      const after = pixels();
      if (options.autoBalance) {
        const measured = imageBalance(after);
        renderer.toneMappingExposure = Math.max(
          0.25,
          Math.min(4, options.exposure * measured.exposure),
        );
        balance.multiply(new THREE.Vector3(...measured.whiteBalance));
      }
      finish();
      context.drawImage(renderer.domElement, 0, 0);
      const regions =
        options.adaptive && options.samples > base
          ? noisyRegions(before, after, 64, 64)
          : [];
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        if (!region) continue;
        options.onStatus?.(
          `Refining noisy region ${i + 1} of ${regions.length}`,
        );
        const x0 = Math.floor(((region.index % 2) * options.width) / 2),
          y0 = Math.floor((Math.floor(region.index / 2) * height) / 2);
        const x1 = Math.floor((((region.index % 2) + 1) * options.width) / 2),
          y1 = Math.floor(((Math.floor(region.index / 2) + 1) * height) / 2);
        const left = Math.max(0, x0 - 8),
          top = Math.max(0, y0 - 8),
          right = Math.min(options.width, x1 + 8),
          bottom = Math.min(height, y1 + 8);
        camera.setViewOffset(
          options.width,
          height,
          left,
          top,
          right - left,
          bottom - top,
        );
        renderer.setSize(right - left, bottom - top, false);
        tracer.updateCamera();
        tracer.reset();
        await sampleTo(options.samples, (n) => {
          options.onProgress(
            options.samples *
              (0.5 + (0.5 * (i + n / options.samples)) / regions.length),
          );
          options.onStatus?.(
            `Refining noisy region ${i + 1} of ${regions.length} · ${Math.round((n / options.samples) * 100)}%`,
          );
        });
        finish();
        context.drawImage(
          renderer.domElement,
          x0 - left,
          y0 - top,
          x1 - x0,
          y1 - y0,
          x0,
          y0,
          x1 - x0,
          y1 - y0,
        );
      }
      options.onProgress(options.samples);
      return output.toDataURL('image/png');
    } finally {
      camera.clearViewOffset();
      material.dispose();
      quad.dispose();
    }
  } finally {
    tracer?.dispose();
    sky?.dispose();
    snapshot.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
