import { Channel, invoke } from '@tauri-apps/api/core';
import { ClipboardReadUnavailableError, type ClipboardContent } from '../../../../shared/remote-desktop/clipboard';
import type { FileReadEvent, LocalFileClipboard } from '../../../../shared/remote-desktop/fileClipboard';
import { CLIPBOARD_ACCESS_ERROR, withClipboardRetry } from './clipboardAccess';

/** The channel remains alive while Explorer owns file promises, including when the viewer is minimized. */
export function createFileClipboard(): LocalFileClipboard {
  const scope = crypto.randomUUID();
  let closed = false;
  const pending = new Set<Promise<unknown>>();
  const invokeRequest = (request: object, onRead?: Channel<FileReadEvent>) =>
    invoke<{ content?: ClipboardContent; data?: string }>('remote_desktop_local_file_clipboard',
      { scope, request, onRead: onRead ?? new Channel<FileReadEvent>() });
  const call = (request: object, onRead?: Channel<FileReadEvent>) => {
    if (closed) return Promise.reject(new Error('桌面连接已结束，请重新连接后再复制文件。'));
    const result = invokeRequest(request, onRead);
    pending.add(result);
    return result.finally(() => pending.delete(result));
  };
  return {
    read: async () => {
      try {
        const result = await withClipboardRetry(() => call({ action: 'read' }));
        if (!result.content) throw new Error('无法访问剪贴板，请重新复制后再试。');
        return result.content;
      } catch (error) {
        if (error === CLIPBOARD_ACCESS_ERROR) throw new ClipboardReadUnavailableError(error);
        throw error;
      }
    },
    chunk: async request => {
      const result = await call({ action: 'chunk', request });
      if (typeof result.data !== 'string') throw new Error('文件传输失败，请重新复制。');
      return result.data;
    },
    publish: (offer, read) => withClipboardRetry(async () => {
      const channel = new Channel<FileReadEvent>();
      channel.onmessage = event => {
        void read(event).then(data => data, () => undefined).then(data =>
          call({ action: 'reply', requestId: event.requestId, data })).catch(() => undefined);
      };
      await call({ action: 'publish', offer }, channel);
    }),
    close: () => {
      if (closed) return;
      closed = true;
      const release = () => invokeRequest({ action: 'release' }).catch(() => undefined);
      void release();
      // Revoke again after already-running clipboard I/O settles, so a late capture/publish cannot resurrect it.
      if (pending.size) void Promise.allSettled([...pending]).then(release);
    },
  };
}
