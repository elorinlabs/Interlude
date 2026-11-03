import { invoke, isTauri } from '@tauri-apps/api/core';
import { imageData } from './types';

const DOWNLOAD_URL_LIFETIME_MS = 1000;

/** Save the received image bytes on the viewing device, including in desktop remote mode. */
export async function saveLoungeImage(uri: string): Promise<void> {
  if (!imageData(uri)) throw new Error('client.workspaceActions.couldNotSaveTheImagePleaseTryAgain');
  if (isTauri()) {
    // Cancellation is a normal result; the native action owns the destination and byte validation.
    await invoke<{ completed: boolean }>('codex_gui_image_action', { request: { source: uri, action: 'saveAs' } });
    return;
  }
  downloadImage(uri);
}

function downloadImage(uri: string) {
  const mime = uri.slice('data:'.length, uri.indexOf(';'));
  const bytes = Uint8Array.from(atob(uri.slice(uri.indexOf(',') + 1)), character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Interlude-image.${mime === 'image/jpeg' ? 'jpg' : mime.slice('image/'.length)}`;
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
  }
}
