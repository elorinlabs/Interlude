import { MAX_IMAGE_BYTES } from './types';

const MAX_DIMENSION = 2048;
const MAX_PIXELS = 20_000_000;
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function readDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('client.lounge.imageFailed'));
    reader.readAsDataURL(blob);
  });
}

function encode(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob); else reject(new Error('client.lounge.imageFailed'));
  }, mime, quality));
}

/** The wire limit applies to decoded image bytes; base64 transport overhead is separate. */
export async function prepareImage(file: File): Promise<{ data: string; flattened: boolean }> {
  if (!ACCEPTED.has(file.type)) throw new Error('client.lounge.imageFormat');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('client.lounge.imageFailed'); }
  try {
    const safeOriginal = bitmap.width * bitmap.height <= MAX_PIXELS;
    if (file.size <= MAX_IMAGE_BYTES && file.type !== 'image/webp' && safeOriginal) {
      return { data: await readDataURL(file), flattened: false };
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('client.lounge.imageFailed');
    const ratio = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * ratio));
    let height = Math.max(1, Math.round(bitmap.height * ratio));
    const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    for (let attempt = 0; attempt < 12; attempt++) {
      canvas.width = width; canvas.height = height;
      context.drawImage(bitmap, 0, 0, width, height);
      const result = await encode(canvas, mime, Math.max(0.55, 0.88 - attempt * 0.05));
      if (result.size <= MAX_IMAGE_BYTES) {
        return { data: await readDataURL(result), flattened: file.type === 'image/gif' || file.type === 'image/webp' };
      }
      width = Math.max(1, Math.floor(width * 0.78)); height = Math.max(1, Math.floor(height * 0.78));
    }
    throw new Error('client.lounge.imageFailed');
  } finally { bitmap.close(); }
}
