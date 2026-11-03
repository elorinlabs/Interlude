import type { DownloadTask } from '../types';
import { displayText } from '../../i18n';
import { archivePercent, archiveStatus } from '../../../../../shared/remote-chat/archiveDownload';

export type DownloadFilter = 'all' | 'active' | 'ready';
export type DownloadSort = 'recent' | 'name' | 'size';
export type DownloadText = typeof displayText;
export const isDownloadReady = (task: DownloadTask) => ['ready', 'saving', 'completed'].includes(task.status);
export const isDownloadRunning = (task: DownloadTask) =>
  ['queued', 'preparing', 'downloading', 'verifying'].includes(task.status);

const STATUS = {
  queued: 'client.downloads.queued', preparing: 'client.downloads.preparingAndCheckingTheFile',
  downloading: 'client.downloads.downloading.e2fc57', verifying: 'client.downloads.verifying',
  ready: 'client.downloads.readyToSave', saving: 'client.downloads.saving',
  paused: 'client.downloads.paused', completed: 'client.chat.completed', failed: 'client.downloads.downloadFailed',
} as const;

export function downloadStatus(task: DownloadTask, retryAttempt: number, text: DownloadText) {
  if (retryAttempt) return text('client.downloads.workspace.waitingRetry');
  if (task.status === 'preparing' && task.preparation) return text(archiveStatus(task.preparation));
  return text(STATUS[task.status]);
}

export function downloadPercent(task: DownloadTask) {
  if (task.status === 'preparing') return task.preparation ? archivePercent(task.preparation) : undefined;
  if (!task.size) return undefined;
  return Math.min(100, Math.max(0, Math.round(task.received / task.size * 100)));
}

export function remainingTime(task: DownloadTask, text: DownloadText) {
  if (task.status !== 'downloading' || !task.bytesPerSecond || task.received >= task.size) return '';
  const seconds = Math.ceil((task.size - task.received) / task.bytesPerSecond);
  if (seconds < 60) return text('client.downloads.workspace.remainingSeconds', { count: seconds });
  return text('client.downloads.workspace.remainingMinutes', { count: Math.ceil(seconds / 60) });
}

export function visibleDownloads(tasks: DownloadTask[], options: {
  filter: DownloadFilter; query: string; sort: DownloadSort;
}) {
  const query = options.query.trim().toLocaleLowerCase();
  return tasks.filter(task => (!query || task.name.toLocaleLowerCase().includes(query))
    && (options.filter === 'all' || isDownloadReady(task) === (options.filter === 'ready')))
    .sort((first, second) => {
      if (options.sort === 'name') return first.name.localeCompare(second.name, undefined, { numeric: true });
      if (options.sort === 'size') return second.size - first.size || second.createdAt - first.createdAt;
      return second.createdAt - first.createdAt;
    });
}
