import { toByteArray } from 'base64-js';
import { downloadProjectEntry } from '../project-browser/downloads';
import type { ProjectBrowserClient } from '../project-browser/protocol';
import { checkPreviewSize, previewMimeType, type PreviewLoader } from './kinds';

export function projectPreviewLoader(client: ProjectBrowserClient, cwd: string): PreviewLoader {
  return async (path, options) => {
    if (!client.transfer) throw new Error('client.filePreview.unavailable');
    const parts: Uint8Array[] = [];
    let mime = '';
    await downloadProjectEntry({ client: client.transfer, file: { cwd, path }, transferId: crypto.randomUUID(),
      ...options, target: async info => {
        checkPreviewSize(info.size);
        mime = info.mimeType;
        return { write: async data => { parts.push(toByteArray(data)); },
          finish: async () => {}, dispose: async () => {} };
      } });
    return new Blob(parts, { type: mime && mime !== 'application/octet-stream' ? mime : previewMimeType(path) });
  };
}
