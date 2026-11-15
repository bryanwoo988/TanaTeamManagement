const MAX_EDGE = 1600;
const GOOD_ENOUGH = 500 * 1024;
const MAX_UPLOAD = 2 * 1024 * 1024; // storage rule limit
const QUALITIES = [0.8, 0.7, 0.6];

const unreadable = () => new Error('photo.unreadable');

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(unreadable())), 'image/jpeg', quality),
  );
}

/**
 * Shrink a camera/album photo for upload: long edge at most 1600 px, JPEG, EXIF rotation applied.
 * Starts at quality 0.8 and only retries lower (0.7, 0.6) while the result is over 500 KB; returns the smallest.
 * Throws Error('photo.tooLarge' ) when even the smallest result is 2 MB or more (storage would refuse it), and Error('photo.unreadable') when the browser cannot decode the file (e.g. HEIC on an old browser).
 */
export async function compressImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw unreadable();
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw unreadable();
    ctx.fillStyle = '#fff'; // JPEG has no alpha; keep transparent PNG screenshots from turning black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let best: Blob | null = null;
    for (const q of QUALITIES) {
      const out = await encode(canvas, q);
      if (!best || out.size < best.size) best = out;
      if (out.size <= GOOD_ENOUGH) break;
    }
    if (best!.size >= MAX_UPLOAD) throw new Error('photo.tooLarge');
    return best!;
  } finally {
    bitmap.close?.();
  }
}
