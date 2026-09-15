export type Balance = {
  exposure: number;
  whiteBalance: [number, number, number];
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Robust midtone balance; ignore clipped pixels and saturated material colors. */
export function imageBalance(pixels: Uint8ClampedArray): Balance {
  const levels: number[] = [];
  const neutral = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = (pixels[i] ?? 0) / 255,
      g = (pixels[i + 1] ?? 0) / 255,
      b = (pixels[i + 2] ?? 0) / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (l < 0.04 || l > 0.95) continue;
    levels.push(l);
    if ((Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b) < 0.22) {
      neutral[0] = (neutral[0] ?? 0) + r;
      neutral[1] = (neutral[1] ?? 0) + g;
      neutral[2] = (neutral[2] ?? 0) + b;
      count++;
    }
  }
  if (levels.length < 8) return { exposure: 1, whiteBalance: [1, 1, 1] };
  levels.sort((a, b) => a - b);
  const mid = levels[Math.floor(levels.length * 0.5)] ?? 0.5;
  const mean = neutral.reduce((a, b) => a + b, 0) / 3;
  const gains =
    count > 8
      ? neutral.map((v) => clamp(mean / Math.max(v, 0.001), 0.8, 1.25))
      : [1, 1, 1];
  return {
    exposure: clamp(Math.pow(0.52 / mid, 1.4), 0.65, 2.5),
    whiteBalance: [gains[0] ?? 1, gains[1] ?? 1, gains[2] ?? 1],
  };
}
/** Temporal change of progressive samples, measured by region rather than texture contrast. */
export function noisyRegions(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 1.6,
) {
  const scores = Array.from({ length: 4 }, () => ({ sum: 0, n: 0 }));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const region = (y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0),
        s = scores[region];
      if (!s) continue;
      const i = (y * width + x) * 4;
      s.sum +=
        Math.abs((before[i] ?? 0) - (after[i] ?? 0)) +
        Math.abs((before[i + 1] ?? 0) - (after[i + 1] ?? 0)) +
        Math.abs((before[i + 2] ?? 0) - (after[i + 2] ?? 0));
      s.n += 3;
    }
  return scores
    .map((s, index) => ({ index, change: s.sum / Math.max(1, s.n) }))
    .filter((s) => s.change > threshold)
    .sort((a, b) => b.change - a.change);
}
