import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { SubscribeFileDrop } from '../../../../../../shared/chat/useFileDrop';
import type { SshUploadBatch } from '../../../../../../shared/terminal/sshDrop';

interface NativeFile { token: string; name: string; size: number }
type Reply = { type: 'files'; files: NativeFile[] } | { type: 'data'; data: string } | { type: 'done' };
const command = (request: object) => invoke<Reply>('codex_gui_ssh_drop_files', { request });

export const subscribeSshFileDrop: SubscribeFileDrop | undefined = isTauri()
  ? listener => getCurrentWebview().onDragDropEvent(event => listener(event.payload)) : undefined;

/** Keep OS paths on the sending computer, even when the SSH session runs on another PC. */
export async function nativeSshUploadBatch(paths: string[]): Promise<SshUploadBatch> {
  const result = await command({ type: 'open', paths });
  if (result.type !== 'files') throw new Error('client.ssh.localFileUnavailable');
  let released = false;
  return {
    files: result.files.map(file => ({ name: file.name, size: file.size, async read(offset, length) {
      const chunk = await command({ type: 'read', token: file.token, offset, length });
      if (chunk.type !== 'data') throw new Error('client.ssh.localFileUnavailable');
      return chunk.data;
    } })),
    async release() {
      if (released) return;
      released = true;
      await command({ type: 'close', tokens: result.files.map(file => file.token) });
    },
  };
}
