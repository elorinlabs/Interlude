import { useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { useFileDownload } from '../../../../shared/remote-chat/useFileDownload';
import { previewProgressText } from '../../../../shared/chat/previewProgress';
import { t } from '../i18n';
import type { FilePreviewContext } from '../chat/ChatFilePreview';
import { browserDownloadTarget, prepareBrowserDownload } from '../chat/fileDownloadTarget';
import { downloadManager } from './manager';
import type { DownloadConnection } from './types';
import { FileDownloadControl } from './FileDownloadControl';
import { animateDownloadToNavigation, downloadOrigin } from './downloadFeedback';
import { canShareDownload, DownloadShareError } from './shareDownload';

const DOWNLOAD_STATUS = { queued: "client.downloads.queued", preparing: "client.downloads.preparingAndCheckingTheFile", downloading: "client.downloads.downloading.e2fc57",
  verifying: "client.downloads.verifying", ready: "client.downloads.readyToSave", saving: "client.downloads.saving", paused: "client.downloads.paused", completed: "client.chat.completed", failed: "client.downloads.downloadFailed" };

interface Props { path: string; context: FilePreviewContext }

export function FileDownloadButton(props: Props) {
  const connection = useSyncExternalStore(downloadManager.subscribe,
    () => downloadManager.connectionForFile(props.context.client));
  if (connection?.files === props.context.client) return <ManagedDownload {...props} connection={connection} />;
  return <DirectDownload {...props} />;
}

function ManagedDownload({ path, context, connection }: Props & { connection: DownloadConnection }) {
  const tasks = useSyncExternalStore(downloadManager.subscribe, downloadManager.snapshot);
  const task = [...tasks].reverse().find(task => task.source.owner === connection.owner
    && task.source.deviceId === connection.deviceId && task.source.threadId === context.threadId
    && task.source.path === path && task.source.scope === 'project' && !task.source.preview);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const running = task && ['queued', 'preparing', 'downloading', 'verifying'].includes(task.status);
  const completed = task?.status === 'completed' || task?.status === 'ready';
  const progress = task && previewProgressText({ received: task.received, status: task.status,
    total: task.status === 'queued' || task.status === 'preparing' ? undefined : task.size,
    bytesPerSecond: task.status === 'downloading' ? task.bytesPerSecond : undefined });
  const run = async (event: MouseEvent<HTMLButtonElement>, operation: 'download' | 'share' = 'download') => {
    if (pending.current) return;
    const origin = downloadOrigin(event);
    pending.current = true; setBusy(true); setError('');
    try {
      if (operation === 'share' && completed && task) await downloadManager.share(task.id);
      else if (completed && task) await downloadManager.save(task.id);
      else if (running && task) await downloadManager.pause(task.id);
      else if (task) await downloadManager.resume(task.id);
      else if (context.threadId) await downloadManager.enqueue({ owner: connection.owner,
        deviceId: connection.deviceId, deviceName: connection.deviceName, scope: 'project',
        threadId: context.threadId, path });
      if (operation === 'download' && !completed && !running) animateDownloadToNavigation(origin);
    } catch (cause) {
      setError(cause instanceof DownloadShareError ? cause.message
        : t("client.downloads.couldNotCompleteTheActionCheckBrowserStorageAndRetry"));
    }
    finally { pending.current = false; setBusy(false); }
  };
  let action: 'download' | 'save' | 'pause' | 'resume' = 'download';
  if (completed || task?.status === 'saving') action = 'save';
  else if (running) action = 'pause';
  else if (task) action = 'resume';
  return <FileDownloadControl action={action} onAction={event => { void run(event); }}
    onShare={completed && task && canShareDownload(task) ? event => { void run(event, 'share'); } : undefined}
    disabled={busy || task?.status === 'saving' || (!running && !completed && (!context.ready || !context.threadId))}
    progress={task && progress ? { percent: progress.percent, status: DOWNLOAD_STATUS[task.status],
      detail: `${progress.amount}${task.status === 'downloading' && task.bytesPerSecond ? ` · ${progress.speed}` : ''}`,
    } : undefined} message={error || task?.message}
    note={task ? "client.downloads.downloadsContinueInTheBackgroundTrackProgressInDownloads" : undefined} />;
}

function DirectDownload({ path, context }: Props) {
  const download = useFileDownload({ ...context, path, target: browserDownloadTarget,
    prepare: () => prepareBrowserDownload(path), success: t("client.chat.yourBrowserIsSavingTheFile") });
  return <FileDownloadControl action={download.busy ? 'cancel' : 'download'}
    disabled={!download.busy && (!context.ready || !context.threadId)}
    onAction={download.busy ? download.cancel : download.start}
    progress={download.busy ? { percent: download.detail ? download.percent : undefined,
      status: download.detail ? "client.downloads.downloading.e2fc57" : "client.downloads.preparingDownload.d0274b", detail: download.detail } : undefined}
    message={download.message} />;
}
