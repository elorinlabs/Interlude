import { toByteArray } from 'base64-js';
import type { SshApi } from '../terminal/ssh';
import { PROJECT_FILE_CHUNK_BYTES } from '../project-browser/protocol';
import { sshParent } from '../terminal/useSshFiles';
import { checkPreviewSize, previewMimeType, type PreviewLoader } from './kinds';

export function sshPreviewLoader(api: SshApi, id: string): PreviewLoader {
  return async (path, { signal, progress }) => {
    signal.throwIfAborted();
    const directory = await api.files(id, { type: 'list', path: sshParent(path) });
    const file = directory.type === 'list' && directory.entries.find(entry => entry.path === path);
    if (!file || file.directory) throw new Error('client.filePreview.unavailable');
    checkPreviewSize(file.size);
    const parts: Uint8Array[] = [];
    progress(0, file.size);
    for (let offset = 0; offset < file.size; offset += PROJECT_FILE_CHUNK_BYTES) {
      signal.throwIfAborted();
      const length = Math.min(PROJECT_FILE_CHUNK_BYTES, file.size - offset);
      const reply = await api.files(id, { type: 'readChunk', path, offset, length });
      signal.throwIfAborted();
      if (reply.type !== 'file') throw new Error('client.filePreview.unavailable');
      const bytes = toByteArray(reply.data);
      if (bytes.length !== length) throw new Error('client.filePreview.unavailable');
      parts.push(bytes);
      progress(offset + length, file.size);
    }
    return new Blob(parts, { type: previewMimeType(path) });
  };
}
