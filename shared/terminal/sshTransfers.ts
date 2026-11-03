import type { SshEntry } from './ssh';

export interface SshUpload { name: string; size: number; read: (offset: number, length: number) => Promise<string> }
export type SshDownload = (entry: SshEntry, data: string) => Promise<void>;

export const browserSshUpload = (file: File): SshUpload => ({
  name: file.name, size: file.size,
  async read(offset, length) {
    const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
    let binary = '';
    const chunkSize = 8192;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  },
});

export const browserSshDownload: SshDownload = async (entry, data) => {
  const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes]));
  const link = document.createElement('a'); link.href = url; link.download = entry.name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
