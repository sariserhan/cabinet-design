import * as THREE from 'three';

/** Convert canvas height maps into tangent normals for the photo engine. */
export function normalFromHeight(
  map: THREE.Texture,
  bumpScale: number,
  inches: [number, number] = [24, 36],
) {
  const source = map.image as HTMLCanvasElement | undefined;
  if (typeof document === 'undefined' || !source?.getContext) return null;
  const context = source.getContext('2d');
  if (!context) return null;
  const { width, height } = source;
  const pixels = context.getImageData(0, 0, width, height).data;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const output = canvas.getContext('2d');
  if (!output) return null;
  const data = output.createImageData(width, height);
  const value = (x: number, y: number) =>
    (pixels[(((y + height) % height) * width + ((x + width) % width)) * 4] ??
      0) / 255;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const nx =
        ((value(x - 1, y) - value(x + 1, y)) * bumpScale * width) /
        (2 * inches[0]);
      const ny =
        ((value(x, y + 1) - value(x, y - 1)) * bumpScale * height) /
        (2 * inches[1]);
      const length = Math.hypot(nx, ny, 1),
        i = (y * width + x) * 4;
      data.data[i] = ((nx / length) * 0.5 + 0.5) * 255;
      data.data[i + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      data.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      data.data[i + 3] = 255;
    }
  output.putImageData(data, 0, 0);
  const normal = new THREE.CanvasTexture(canvas);
  normal.wrapS = map.wrapS;
  normal.wrapT = map.wrapT;
  normal.repeat.copy(map.repeat);
  normal.offset.copy(map.offset);
  normal.rotation = map.rotation;
  normal.colorSpace = THREE.NoColorSpace;
  return normal;
}
