import { DownloadCancelled, DownloadValidationError, type FileInfo } from './fileDownload';
import type { DownloadOpen } from './downloads';

export interface ArchiveProgress {
  phase: 'scanning' | 'compressing' | 'finalizing';
  processedBytes: number; totalBytes: number; completedFiles: number; totalFiles: number;
}
export interface DownloadPreparationOptions {
  signal?: AbortSignal;
  progress?: (progress: ArchiveProgress) => void | Promise<void>;
}
export interface ArchivePreparation { preparationId: string; progress: ArchiveProgress }
export type DownloadOpenRequest = DownloadOpen & { prepare?: boolean; preparationId?: string };
type Reply = FileInfo | ArchivePreparation;
interface Transport {
  open: (request: DownloadOpenRequest) => Promise<Reply>;
  close: (transferId: string, id: string) => Promise<unknown>;
}
const POLL_INTERVAL_MS = 500;

export function archivePercent(progress: ArchiveProgress) {
  if (progress.phase === 'scanning') return undefined;
  if (progress.phase === 'finalizing') return 100;
  const ratio = progress.totalBytes ? progress.processedBytes / progress.totalBytes
    : progress.totalFiles ? progress.completedFiles / progress.totalFiles : 1;
  return Math.min(100, Math.floor(ratio * 100));
}

export const archiveStatus = (progress: ArchiveProgress) => ({
  scanning: "client.downloads.countingFiles", compressing: "client.downloads.compressing", finalizing: "client.downloads.preparingDownload",
})[progress.phase];

function validatePreparation(reply: ArchivePreparation) {
  const progress = reply.progress;
  if (!/^[a-z\d-]{36}$/i.test(reply.preparationId) || !progress
    || !['scanning', 'compressing', 'finalizing'].includes(progress.phase)
    || [progress.processedBytes, progress.totalBytes, progress.completedFiles, progress.totalFiles]
      .some(value => !Number.isSafeInteger(value) || value < 0)
    || progress.processedBytes > progress.totalBytes || progress.completedFiles > progress.totalFiles) {
    throw new DownloadValidationError('下载进度无效，请重新下载。');
  }
}

function wait(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, POLL_INTERVAL_MS);
    const abort = () => { clearTimeout(timer); reject(new DownloadCancelled()); };
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Abort promptly; a late reply still owns a handle that must be released. */
function request(transport: Transport, options: DownloadOpenRequest, signal?: AbortSignal): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DownloadCancelled());
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    transport.open(options).then(reply => {
      if (signal?.aborted) {
        void transport.close(options.transferId, 'preparationId' in reply ? reply.preparationId : reply.id)
          .catch(() => console.warn('Cancelled download preparation will expire.'));
      } else resolve(reply);
    }, reject).finally(() => signal?.removeEventListener('abort', abort));
  });
}

/** Older hosts return FileInfo immediately; new hosts expose bounded, single-flight preparation polls. */
export async function openPreparedDownload(
  transport: Transport, options: DownloadOpen, controls: DownloadPreparationOptions = {},
): Promise<FileInfo> {
  let preparationId: string | undefined;
  try {
    let reply = await request(transport, { ...options, prepare: true }, controls.signal);
    while ('preparationId' in reply) {
      preparationId = reply.preparationId;
      validatePreparation(reply);
      await controls.progress?.(reply.progress);
      await wait(controls.signal);
      reply = await request(transport, { ...options, preparationId }, controls.signal);
    }
    return reply;
  } catch (error) {
    if (preparationId) void transport.close(options.transferId, preparationId)
      .catch(() => console.warn('Cancelled download preparation will expire.'));
    throw error;
  }
}
