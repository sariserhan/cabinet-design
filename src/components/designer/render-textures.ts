import * as THREE from 'three';

/**
 * How many samples a texture may use at a grazing angle.
 *
 * Textures are built before there is a renderer to ask, so this starts at the
 * value every device supports and the Render view raises it to the device
 * maximum once one exists.
 */
let anisotropy = 4;
export function setTextureAnisotropy(maximum: number) {
  anisotropy = Math.max(4, Math.min(16, Math.floor(maximum)));
}
export function textureAnisotropy() {
  return anisotropy;
}
/** Deterministic material maps generated locally; no external image service. */
export function materialTexture(
  kind:
    | 'wood'
    | 'floor'
    | 'quartz'
    | 'marble'
    | 'granite'
    | 'subway'
    | 'metal'
    | 'walnut'
    | 'tile'
    | 'slate'
    | 'mosaic'
    | 'stacked',
) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas textures unavailable');
  let seed = 719;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle =
    kind === 'granite'
      ? '#55585a'
      : kind === 'wood' || kind === 'floor' || kind === 'walnut'
        ? kind === 'walnut'
          ? '#72503a'
          : kind === 'floor'
            ? '#c5b08f'
            : '#c4a579'
        : '#f2f0ea';
  ctx.fillRect(0, 0, 512, 512);
  if (['tile', 'slate', 'mosaic', 'stacked'].includes(kind)) {
    ctx.fillStyle = '#b2b1aa';
    ctx.fillRect(0, 0, 512, 512);
    const size = kind === 'mosaic' ? 32 : kind === 'stacked' ? 64 : 256;
    for (let y = 0; y < 512; y += size)
      for (let x = 0; x < 512; x += size) {
        const palette =
          kind === 'slate'
            ? ['#4b5154', '#586064', '#62686a']
            : kind === 'mosaic'
              ? ['#b8d4cf', '#e9eee5', '#739c99']
              : kind === 'stacked'
                ? ['#dad1bc', '#eee6d4', '#d1c5ad']
                : ['#ddd9cd', '#e8e4d9', '#d5d1c6'];
        ctx.fillStyle =
          palette[Math.floor(random() * palette.length)] ?? '#ddd9cd';
        ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
        for (let i = 0; i < 100; i++) {
          ctx.fillStyle = 'rgba(60,60,55,.025)';
          ctx.fillRect(x + random() * size, y + random() * size, 2, 1);
        }
      }
  } else if (kind === 'metal') {
    ctx.fillStyle = '#d5d7d8';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1800; i++) {
      ctx.strokeStyle = 'rgba(60,64,67,' + random() * 0.035 + ')';
      ctx.lineWidth = 0.3 + random() * 0.4;
      const y = random() * 512;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y + random() * 0.8);
      ctx.stroke();
    }
  } else if (kind === 'subway') {
    ctx.fillStyle = '#c9c4ba';
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 4; row++)
      for (let col = -1; col < 3; col++) {
        const x = col * 256 + (row % 2) * 128,
          y = row * 128;
        ctx.fillStyle =
          ['#eeeae1', '#e6e4dc', '#f3f0e8'][Math.floor(random() * 3)] ??
          '#eeeae1';
        ctx.fillRect(x + 3, y + 3, 250, 122);
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 5, y + 5, 246, 118);
      }
  } else if (kind === 'wood' || kind === 'floor' || kind === 'walnut') {
    // Subtle board-to-board variation under the grain, aligned with the joints.
    if (kind !== 'wood') {
      for (let x = 0; x < 512; x += 64) {
        const offset = (x % 128) * 3;
        for (let y = offset - 256; y < 512; y += 256) {
          ctx.fillStyle = `rgba(${random() > 0.5 ? '255,240,211' : '57,35,20'},${0.025 + random() * 0.07})`;
          ctx.fillRect(x, y, 64, 256);
        }
      }
    }
    for (let i = 0; i < 1100; i++) {
      const x = random() * 512;
      ctx.strokeStyle = `rgba(${random() > 0.5 ? '86,49,19' : '244,218,174'},${0.012 + random() * 0.045})`;
      ctx.lineWidth = 0.3 + random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 8)
        ctx.lineTo(
          x + Math.sin(y / 65 + x / 35) * 3 + Math.sin(y / 120) * 6,
          y,
        );
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const x = random() * 512,
        y = random() * 512;
      for (let j = 0; j < 12; j++) {
        ctx.strokeStyle = 'rgba(96,59,28,.025)';
        ctx.beginPath();
        ctx.ellipse(x, y, 3 + j * 1.2, 12 + j * 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (kind === 'floor' || kind === 'walnut') {
      ctx.strokeStyle = 'rgba(105,85,61,.32)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= 512; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 512);
        ctx.stroke();
        for (let y = (x % 128) * 3; y < 512; y += 256) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 64, y);
          ctx.stroke();
        }
      }
    }
  } else {
    for (let i = 0; i < 18000; i++) {
      const v =
        kind === 'granite'
          ? Math.floor(60 + random() * 170)
          : Math.floor(175 + random() * 60);
      ctx.fillStyle = `rgba(${v},${v},${v},${kind === 'granite' ? 0.55 : 0.22})`;
      ctx.fillRect(
        random() * 512,
        random() * 512,
        random() * 2 + 0.3,
        random() * 2 + 0.3,
      );
    }
    if (kind === 'marble') {
      // Broad translucent mineral bands with fine branching veins, not parallel stripes.
      for (let i = 0; i < 5; i++) {
        const start = -180 + i * 170;
        for (const [width, opacity] of [
          [24, 0.025],
          [9, 0.04],
          [1.3, 0.2],
        ]) {
          ctx.beginPath();
          ctx.moveTo(start, -20);
          ctx.bezierCurveTo(
            start + 170,
            130,
            start - 80,
            280,
            start + 230,
            540,
          );
          ctx.lineWidth = width ?? 1;
          ctx.strokeStyle = `rgba(112,112,105,${opacity})`;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(start + 80, 220);
        ctx.bezierCurveTo(start + 130, 310, start + 230, 240, start + 330, 350);
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = 'rgba(130,126,114,.18)';
        ctx.stroke();
      }
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = anisotropy;
  return map;
}

/** Linear data, separate from the pigment: polished stone veins are not grooves. */
export function surfaceDetail(kind: 'paint' | 'wood' | 'stone' | 'metal') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas textures unavailable');
  const pixels = ctx.createImageData(256, 256);
  let seed = 1931;
  for (let y = 0; y < 256; y++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const brush = seed / 4294967296;
    for (let x = 0; x < 256; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = seed / 4294967296;
      // A single high-frequency sine gives evenly spaced bands, which read as
      // corduroy rather than timber. Real grain wanders along the board and its
      // bands vary in width, so sum incommensurate frequencies over a wandering
      // coordinate: no two bands then land at the same spacing within a tile.
      const wander =
        Math.sin((y / 256) * Math.PI * 2) * 0.06 +
        Math.sin((y / 256) * Math.PI * 6.3 + 1.1) * 0.02;
      const t = x / 256 + wander;
      const grain =
        Math.sin(t * Math.PI * 17.9) * 0.55 +
        Math.sin(t * Math.PI * 41.3 + 1.7) * 0.28 +
        Math.sin(t * Math.PI * 7.1 + 0.4) * 0.17;
      // Brushing is a field of fine parallel grooves, each polished to its
      // own depth: the panel is one roughness at a distance and a stack of
      // light and dark lines close up. A narrow band around one value - what
      // this was - is a smooth panel with a whisper of texture, which is why
      // steel read as paint. The line's own roughness carries most of the
      // range, and a little per-pixel noise keeps the lines from being
      // ruled.
      const value =
        kind === 'metal'
          ? 118 + brush * 104 + noise * 22
          : kind === 'wood'
            ? 190 + grain * 26 + noise * 16
            : kind === 'paint'
              ? 215 + noise * 25
              : 230 + noise * 15;
      const i = (y * 256 + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = anisotropy;
  return map;
}
