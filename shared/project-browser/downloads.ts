import type { DownloadBrowse, DownloadClient } from '../remote-chat/downloads';
import { downloadFile, type DownloadTarget, type FileInfo, type FileRequest } from '../remote-chat/fileDownload';
import { fileDownloadByteLimit } from '../remote-chat/policy';
import type { ConnectionMode } from '../remote-chat/protocol';
import type { ProjectFileTarget } from './protocol';
import { openPreparedDownload, type DownloadOpenRequest } from '../remote-chat/archiveDownload';

type Request = FileRequest | ({ operation: 'downloadOpen'; maxBytes: number } & DownloadOpenRequest)
  | ({ operation: 'downloadBrowse' } & DownloadBrowse);

export function projectDownloads(request: <T>(body: Request) => Promise<T>, mode?: ConnectionMode): DownloadClient {
  return {
    open: (options, controls) => openPreparedDownload({
      open: body => request({ operation: 'downloadOpen', ...body, maxBytes: fileDownloadByteLimit(mode) }),
      close: (threadId, id) => request({ operation: 'fileClose', threadId, id }),
    }, options, controls),
    browse: options => request({ operation: 'downloadBrowse', ...options }),
    read: options => request({ operation: 'fileRead', ...options, maxBytes: fileDownloadByteLimit(mode) }),
    close: (threadId, id) => request({ operation: 'fileClose', threadId, id }),
  };
}

/** Direct fallback for hosts without a background download manager; chunks still use bounded memory. */
export function downloadProjectEntry(options: {
  client: DownloadClient; file: ProjectFileTarget; transferId: string; signal: AbortSignal;
  target: (info: FileInfo) => Promise<DownloadTarget>; progress: (received: number, total: number) => void;
}) {
  return downloadFile({ threadId: options.transferId, path: options.file.path, signal: options.signal,
    target: options.target, progress: options.progress,
    client: { open: transferId => options.client.open({ scope: 'project', ...options.file, transferId },
      { signal: options.signal }),
      read: options.client.read, close: options.client.close } });
}
