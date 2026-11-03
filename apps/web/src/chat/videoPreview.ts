import { t } from '../i18n';
import { downloadFile, type DownloadTarget } from '../../../../shared/remote-chat/fileDownload';
import { MIB } from '../../../../shared/remote-chat/policy';
import type { FileClient } from '../../../../shared/remote-chat/fileDownload';

const MEMORY_PREVIEW_LIMIT = 64 * MIB;
const decode = (data: string) => Uint8Array.from(atob(data), character => character.charCodeAt(0));

/** Browser playback uses a local File, keeping large videos off the JavaScript heap where supported. */
export async function loadVideoPreview(options: {
  client: FileClient; threadId: string; path: string; signal: AbortSignal;
  progress: (received: number, total: number) => void;
}) {
  let url = '';
  let removeFile: (() => Promise<void>) | undefined;
  const cleanup = async () => {
    if (url) URL.revokeObjectURL(url);
    await removeFile?.().catch(() => console.warn('Unable to remove video preview'));
  };
  try {
    await downloadFile({ ...options, target: async info => {
      if (navigator.storage?.getDirectory) {
        const directory = await navigator.storage.getDirectory();
        const name = `chat-video-${crypto.randomUUID()}`;
        const handle = await directory.getFileHandle(name, { create: true });
        removeFile = () => directory.removeEntry(name);
        const writable = await handle.createWritable();
        let completed = false;
        return { write: async data => writable.write(decode(data)),
          finish: async () => { await writable.close(); completed = true;
            url = URL.createObjectURL(new Blob([await handle.getFile()], { type: info.mimeType })); },
          dispose: async () => { if (!completed) await writable.abort(); } } satisfies DownloadTarget;
      }
      if (info.size > MEMORY_PREVIEW_LIMIT) throw new Error(t("client.chat.thisVideoIsLargeDownloadItToPlay"));
      const parts: Uint8Array[] = [];
      return { write: async data => { parts.push(decode(data)); },
        finish: async () => { url = URL.createObjectURL(new Blob(parts, { type: info.mimeType })); },
        dispose: async () => { parts.length = 0; } } satisfies DownloadTarget;
    } });
    return { url, dispose: cleanup };
  } catch (error) { await cleanup(); throw error; }
}
