const ASCII_BLOCK_BYTES = 4096;
const percentBytes = Array.from({ length: 256 }, (_, byte) => `%${byte.toString(16).padStart(2, '0')}`);
const decoder = typeof TextDecoder === 'undefined' ? undefined
  : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** File packets are ASCII. Hermes can decode them without allocating an escape string for every byte. */
export function decodeChatUtf8(bytes: Uint8Array): string {
  if (decoder) return decoder.decode(bytes);
  if (bytes.some((byte) => byte >= 128)) {
    // Preserve strict UTF-8 validation on runtimes without a native decoder.
    return decodeURIComponent(Array.from(bytes, (byte) => percentBytes[byte]).join(''));
  }
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += ASCII_BLOCK_BYTES) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + ASCII_BLOCK_BYTES));
  }
  return result;
}
