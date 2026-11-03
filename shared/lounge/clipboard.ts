import { copyText } from '../clipboard';
import type { LoungeMessage } from './types';

/** Text takes precedence in mixed messages; image-only messages copy the first attached image. */
export async function copyLoungeMessage(message: LoungeMessage) {
  if (message.text) return copyText(message.text);
  const image = message.images[0];
  if (!image || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('clipboard-unavailable');
  }
  // Start the clipboard write during the user gesture; PNG encoding may finish asynchronously.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': clipboardPNG(image) })]);
}

async function clipboardPNG(source: string): Promise<Blob> {
  const response = await fetch(source);
  const blob = await response.blob();
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('clipboard-image-unavailable');
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => {
      if (result) resolve(result); else reject(new Error('clipboard-image-unavailable'));
    }, 'image/png'));
  } finally { bitmap.close(); }
}
