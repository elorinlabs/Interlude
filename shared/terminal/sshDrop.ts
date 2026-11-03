import { browserSshUpload, type SshUpload } from './sshTransfers';
import { sshParent } from './useSshFiles';

export interface SshUploadBatch {
  files: SshUpload[];
  directory?: string;
  release?: () => Promise<void>;
}

export const browserSshUploadBatch = (files: File[]): SshUploadBatch => ({ files: files.map(browserSshUpload) });

/** Search results can belong to a nested folder that is not currently expanded. */
export function sshDropDirectory(target: Element | null, currentDirectory: string): string {
  const entry = target?.closest<HTMLElement>('.pf-tree-row[data-path][data-directory]');
  const path = entry?.dataset.path;
  if (!path) return currentDirectory;
  return entry.dataset.directory === 'true' ? path : sshParent(path);
}

/** A dropped directory can masquerade as a zero-byte File in Chromium. */
export function droppedSshFiles(data: DataTransfer) {
  for (const item of Array.from(data.items ?? [])) {
    if (item.webkitGetAsEntry?.()?.isDirectory) throw new Error('client.ssh.dropFilesOnly');
  }
  return Array.from(data.files);
}

export async function releaseSshUploadBatch(batch: SshUploadBatch) {
  try { await batch.release?.(); }
  catch { console.warn('SSH dropped file cleanup deferred until source expiry'); }
}
