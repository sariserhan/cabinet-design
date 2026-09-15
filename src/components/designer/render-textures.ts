import * as THREE from 'three';
/** Deterministic material maps generated locally; no external image service. */
export function materialTexture(
  kind: 'wood' | 'floor' | 'quartz' | 'marble' | 'granite' | 'subway',
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
      : kind === 'wood' || kind === 'floor'
        ? kind === 'floor'
          ? '#c5b08f'
          : '#c4a579'
        : '#f2f0ea';
  ctx.fillRect(0, 0, 512, 512);
  if (kind === 'subway') {
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
  } else if (kind === 'wood' || kind === 'floor') {
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
    if (kind === 'floor') {
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
    if (kind === 'marble')
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        let x = random() * 512;
        ctx.moveTo(x, 0);
        for (let y = 0; y <= 512; y += 8) {
          x += Math.sin(y / 45 + i) * 3 + random() * 8 - 4;
          ctx.lineTo(x, y);
        }
        ctx.lineWidth = 0.4 + random() * 2;
        ctx.strokeStyle = 'rgba(108,110,111,.32)';
        ctx.stroke();
      }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return map;
}
