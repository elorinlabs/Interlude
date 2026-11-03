import type { DownloadClient } from '../remote-chat/downloads';
import { DownloadCancelled, DownloadValidationError, FILE_CHUNK_BYTES } from '../remote-chat/fileDownload';
import type { SshApi, SshEntry } from './ssh';
import { sshParent } from './useSshFiles';

/** Adapt SSH reads to the download queue without buffering an entire file in memory. */
export function sshDownloadClient(api: SshApi, sessionId: string): DownloadClient {
  const handles = new Map<string, { transferId: string; entry: SshEntry }>();
  const list = async (path: string) => {
    const reply = await api.files(sessionId, { type: 'list', path });
    if (reply.type !== 'list') throw new DownloadValidationError('client.ssh.fileFailed');
    return reply;
  };
  return {
    async open({ path, transferId }, controls) {
      if (controls?.signal?.aborted) throw new DownloadCancelled();
      const directory = await list(sshParent(path));
      const entry = directory.entries.find(file => file.path === path);
      if (!entry || entry.directory || !Number.isSafeInteger(entry.size) || entry.size < 0) {
        throw new DownloadValidationError('client.ssh.fileFailed');
      }
      if (controls?.signal?.aborted) throw new DownloadCancelled();
      const id = crypto.randomUUID();
      handles.set(id, { transferId, entry });
      // SSH listings have no immutable revision. Restart paused reads rather than mix file versions.
      return { id, name: entry.name, size: entry.size, mimeType: 'application/octet-stream' };
    },
    async read({ id, threadId, offset, length }) {
      const handle = handles.get(id);
      if (!handle || handle.transferId !== threadId || !Number.isSafeInteger(offset) || offset < 0
        || !Number.isSafeInteger(length) || length <= 0 || length > FILE_CHUNK_BYTES
        || offset + length > handle.entry.size) throw new DownloadValidationError('client.ssh.fileFailed');
      const reply = await api.files(sessionId, { type: 'readChunk', path: handle.entry.path, offset, length });
      if (reply.type !== 'file') throw new DownloadValidationError('client.ssh.fileFailed');
      return { offset, data: reply.data };
    },
    async close(transferId, id) {
      if (handles.get(id)?.transferId === transferId) handles.delete(id);
    },
    async browse({ directory }) {
      const reply = await list(directory);
      return { directory: reply.path, parent: reply.path === '/' ? null : sshParent(reply.path),
        entries: reply.entries, truncated: reply.truncated };
    },
  };
}
