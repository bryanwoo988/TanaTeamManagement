import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImage } from './compress';

// A tiny canvas stand-in: toBlob returns a blob whose size follows `sizes` (per call) and remembers the canvas size.
const dimsOf = new WeakMap<Blob, [number, number]>();
let sizes: number[];
let calls: { q: number }[];
let drawn: unknown[][];

beforeEach(() => {
  sizes = [100_000];
  calls = [];
  drawn = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    return { drawImage: (...a: unknown[]) => drawn.push(a), fillRect: () => {}, fillStyle: '' } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string, q?: unknown) {
    calls.push({ q: q as number });
    const b = new Blob([new Uint8Array(sizes[Math.min(calls.length - 1, sizes.length - 1)])], { type });
    dimsOf.set(b, [this.width, this.height]);
    cb(b);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const fakeImage = (w: number, h: number) => {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: w, height: h, close }));
  return new File(['x'], 'a.jpg', { type: 'image/jpeg' });
};

describe('compressImage', () => {
  it('scales the long edge to 1600 and outputs JPEG, honouring EXIF orientation', async () => {
    const file = fakeImage(4000, 3000);
    const out = await compressImage(file);
    expect(dimsOf.get(out)).toEqual([1600, 1200]);
    expect(out.type).toBe('image/jpeg');
    expect((createImageBitmap as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
  });

  it('does not upscale small photos, and scales portrait ones by height', async () => {
    expect(dimsOf.get(await compressImage(fakeImage(800, 600)))).toEqual([800, 600]);
    expect(dimsOf.get(await compressImage(fakeImage(3000, 4000)))).toEqual([1200, 1600]);
  });

  it('one pass when already under 500 KB', async () => {
    await compressImage(fakeImage(2000, 1000));
    expect(calls.map((c) => c.q)).toEqual([0.8]);
  });

  it('retries at 0.7 then 0.6 when over 500 KB and returns the smallest', async () => {
    sizes = [900_000, 700_000, 650_000];
    const out = await compressImage(fakeImage(4000, 3000));
    expect(calls.map((c) => c.q)).toEqual([0.8, 0.7, 0.6]);
    expect(out.size).toBe(650_000);
  });

  it('stops retrying as soon as a pass fits', async () => {
    sizes = [900_000, 400_000, 100_000];
    const out = await compressImage(fakeImage(4000, 3000));
    expect(calls).toHaveLength(2);
    expect(out.size).toBe(400_000);
  });

  it('throws photo.unreadable when the file cannot be decoded', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')));
    await expect(compressImage(new File(['x'], 'a.heic'))).rejects.toThrow('photo.unreadable');
  });

  it('throws photo.unreadable when encoding yields nothing', async () => {
    const file = fakeImage(100, 100);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => cb(null));
    await expect(compressImage(file)).rejects.toThrow('photo.unreadable');
  });
});
