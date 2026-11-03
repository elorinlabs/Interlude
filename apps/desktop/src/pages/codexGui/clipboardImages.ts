import { invoke } from '@tauri-apps/api/core';
import { nativeFile } from './nativeFile';

interface ClipboardImage { mimeType: string; data: string }

export async function readClipboardImages(): Promise<File[]> {
  const images = await invoke<ClipboardImage[]>('codex_gui_remote_clipboard_images');
  const files: File[] = [];
  for (const [index, image] of images.entries()) {
    files.push(await nativeFile({ ...image, name: `clipboard-${index + 1}` }));
  }
  return files;
}
