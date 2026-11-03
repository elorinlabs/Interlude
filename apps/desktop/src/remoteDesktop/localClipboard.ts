import { invoke } from '@tauri-apps/api/core';
import { createFileClipboard } from './fileClipboard';
import { CLIPBOARD_ACCESS_ERROR, withClipboardRetry } from './clipboardAccess';
import { ClipboardReadUnavailableError, type ClipboardContent, type LocalDesktopClipboard }
  from '../../../../shared/remote-desktop/clipboard';

async function readLocalClipboard() {
  try { return await withClipboardRetry(() => invoke<ClipboardContent>('remote_desktop_read_local_clipboard')); }
  catch (error) {
    // The native IPC boundary currently returns fixed public error messages instead of error codes.
    const message = error instanceof Error ? error.message : error;
    if (message === CLIPBOARD_ACCESS_ERROR) throw new ClipboardReadUnavailableError(CLIPBOARD_ACCESS_ERROR);
    throw error;
  }
}

/** Windows file promises require an active session; eager clipboard files survive closing the viewer. */
export const localDesktopClipboard: LocalDesktopClipboard = {
  ...(typeof navigator !== 'undefined' && /Windows/.test(navigator.userAgent)
    ? { createFileSession: createFileClipboard } : {}),
  files: true,
  read: readLocalClipboard,
  write: content => withClipboardRetry(() => invoke('remote_desktop_write_local_clipboard', { content })),
};
