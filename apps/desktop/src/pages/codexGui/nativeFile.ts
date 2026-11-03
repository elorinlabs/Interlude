const BASE64_CHUNK_LENGTH = 256 * 1024; // Multiple of four so each block decodes independently.

/** Yield between chunks so native file reads do not interrupt typing or switching conversations. */
export async function nativeFile(file: { name: string; mimeType: string; data: string }): Promise<File> {
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < file.data.length; offset += BASE64_CHUNK_LENGTH) {
    const decoded = atob(file.data.slice(offset, offset + BASE64_CHUNK_LENGTH));
    parts.push(Uint8Array.from(decoded, character => character.charCodeAt(0)));
    if (offset + BASE64_CHUNK_LENGTH < file.data.length) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return new File(parts, file.name, { type: file.mimeType });
}
