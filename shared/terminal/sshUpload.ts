import { sshError, type SshApi, type SshUploadMode } from './ssh';
import type { SshUpload } from './sshTransfers';

export const SSH_UPLOAD_CHUNK_BYTES = 256 * 1024;
export type SshConflictChoice = Exclude<SshUploadMode, 'reject'> | undefined;
export type SshResolveConflict = (name: string) => Promise<SshConflictChoice>;
export interface SshUploadProgress { name: string; sent: number; total: number }
export class SshUploadCancelled extends Error {}
interface Options {
  api: SshApi; id: string; path: string; file: SshUpload; signal: AbortSignal;
  progress: (value: SshUploadProgress) => void; resolveConflict?: SshResolveConflict;
}
const checkCancelled = (signal: AbortSignal) => { if (signal.aborted) throw new SshUploadCancelled(); };

async function transfer(options: Options, mode: SshUploadMode): Promise<string> {
  const { api, id, path, file, signal, progress } = options;
  checkCancelled(signal);
  const started = await api.files(id, { type: 'uploadStart', path, size: file.size, mode });
  if (started.type !== 'upload') throw new Error('client.ssh.fileFailed');
  let finished = false;
  try {
    progress({ name: file.name, sent: 0, total: file.size });
    for (let offset = 0; offset < file.size; offset += SSH_UPLOAD_CHUNK_BYTES) {
      checkCancelled(signal);
      const length = Math.min(SSH_UPLOAD_CHUNK_BYTES, file.size - offset);
      const data = await file.read(offset, length);
      checkCancelled(signal);
      if (!validChunk(data, length)) throw new Error('client.ssh.fileFailed');
      await api.files(id, { type: 'uploadChunk', token: started.token, offset, data });
      progress({ name: file.name, sent: offset + length, total: file.size });
    }
    checkCancelled(signal);
    const result = await api.files(id, { type: 'uploadFinish', token: started.token });
    if (result.type !== 'uploaded') throw new Error('client.ssh.fileFailed');
    finished = true;
    return result.path;
  } finally {
    if (!finished) await api.files(id, { type: 'uploadCancel', token: started.token })
      .catch(() => console.warn('SSH upload cleanup deferred until session cleanup'));
  }
}

function validChunk(data: string, length: number) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length !== Math.ceil(length / 3) * 4) return false;
  const padding = data.endsWith('==') ? 2 : Number(data.endsWith('='));
  return data.length / 4 * 3 - padding === length;
}

/** Bounded reads avoid retaining a complete upload in either the UI or the remote relay. */
export async function uploadSshFile(options: Options) {
  if (!Number.isSafeInteger(options.file.size) || options.file.size < 0) throw new Error('client.ssh.invalid');
  let mode: SshUploadMode = 'reject';
  for (;;) {
    try { return await transfer(options, mode); }
    catch (failure) {
      if (sshError(failure, '') !== 'client.ssh.conflict' || !options.resolveConflict) throw failure;
      checkCancelled(options.signal);
      const choice = await options.resolveConflict(options.file.name);
      if (!choice) throw new SshUploadCancelled();
      mode = choice;
    }
  }
}
