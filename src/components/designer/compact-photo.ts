export async function compactPhoto(file: File) {
  if (!file.type.startsWith('image/') || file.size > 10000000)
    throw Error('Choose an image smaller than 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas'),
      ratio = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Photo processing unavailable.');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.7, 0.5, 0.3, 0.15]) {
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= 12000) return url;
    }
    throw Error('Photo is too detailed; crop it and retry.');
  } finally {
    bitmap.close();
  }
}
