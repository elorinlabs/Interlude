const INLINE_IMAGE_HEADER = /^data:image\/(png|jpeg|webp|gif);base64$/;
const SIGNATURE_BASE64_LENGTH = 16;

/** Correct unreliable picker MIME metadata without decoding or recompressing the whole image.
 * The host still validates the complete payload, supported format and size before sending.
 */
export function normalizeImageDataUrl(url: string): string {
  const separator = url.indexOf(',');
  if (separator < 0 || !INLINE_IMAGE_HEADER.test(url.slice(0, separator))) return url;
  let signature: string;
  try { signature = atob(url.slice(separator + 1, separator + 1 + SIGNATURE_BASE64_LENGTH)); }
  catch { return url; }
  const mime = imageMime(signature);
  if (!mime || url.startsWith(`data:${mime};base64,`)) return url;
  return `data:${mime};base64,${url.slice(separator + 1)}`;
}

function imageMime(signature: string): string | undefined {
  if (signature.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (signature.startsWith('\xff\xd8\xff')) return 'image/jpeg';
  if (signature.startsWith('GIF87a') || signature.startsWith('GIF89a')) return 'image/gif';
  if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP') return 'image/webp';
}
