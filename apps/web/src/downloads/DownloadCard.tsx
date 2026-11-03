import { Download, ExternalLink, Pause, Play, Share2, Trash2 } from 'lucide-react';
import { displayText, displayError } from '../i18n';
import type { DownloadTask } from './types';
import { archivePercent, archiveStatus } from '../../../../shared/remote-chat/archiveDownload';
import { canShareDownload } from './shareDownload';
import { downloadCompletionDetails } from '../../../../shared/downloads/completion';

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
const STATUS = { queued: "client.downloads.queued", preparing: "client.downloads.preparingAndCheckingTheFile", downloading: "client.downloads.downloading.e2fc57", verifying: "client.downloads.verifying",
  ready: "client.downloads.readyToSave", saving: "client.downloads.saving", paused: "client.downloads.paused", completed: "client.chat.completed", failed: "client.downloads.downloadFailed" };

export function DownloadCard({ task, busy, connected, action, open, share, remove,
  selected = false, toggleSelection, text = displayText }: {
  task: DownloadTask; busy: boolean; connected: boolean; action: () => void; remove: () => void;
  open: () => void; share?: () => void; text?: typeof displayText;
  selected?: boolean; toggleSelection?: () => void;
}) {
  const running = ['downloading', 'queued', 'preparing', 'verifying'].includes(task.status);
  const completed = ['completed', 'ready', 'saving'].includes(task.status);
  const completion = completed ? downloadCompletionDetails(task, text) : undefined;
  const label = completed ? "client.downloads.saveToDevice" : running ? "client.downloads.pause" : "client.downloads.resumeDownload";
  const Icon = completed ? Download : running ? Pause : Play;
  const preparation = task.status === 'preparing' ? task.preparation : undefined;
  const downloadPercent = task.size ? Math.round(task.received / task.size * 100) : 0;
  const percent = preparation ? archivePercent(preparation) : completed ? 100 : downloadPercent;
  const status = preparation ? archiveStatus(preparation) : STATUS[task.status];
  const detail = preparation ? text("client.downloads.compressedFiles", {
    done: preparation.completedFiles, total: preparation.totalFiles,
  }) : `${formatBytes(task.received)} / ${formatBytes(task.size)}`;
  return <article className={`download-card${toggleSelection ? ' is-selectable' : ''}${selected ? ' is-selected' : ''}`}
    aria-label={task.name} onClick={event => {
      if (!busy && !(event.target as HTMLElement).closest('button, input')) toggleSelection?.();
    }}>
    <div className="download-task-heading">
      {toggleSelection && <input type="checkbox" className="download-selection" checked={selected} disabled={busy}
        aria-label={text('client.downloads.selectTask', { name: task.name })} onChange={toggleSelection} />}
      <strong>{task.name}</strong><span>{text(status)}
      {preparation?.phase === 'compressing' && ` · ${percent}%`}</span></div>
    <p className="download-path">{task.source.deviceName} · {task.source.path}</p>
    <progress max={100} value={percent} aria-label={text(
      preparation ? "client.downloads.compressionProgress" : "client.downloads.downloadProgress.38d673", { name: task.name })} />
    <div className="download-task-meta"><span>
      {task.status === 'preparing' && preparation?.phase !== 'compressing' ? text(status) : detail}</span>
      {task.status === 'downloading' && !!task.bytesPerSecond && <span>{formatBytes(task.bytesPerSecond)}/s</span>}
    </div>
    {completion?.summary && <p className="download-completion">{completion.summary}</p>}
    {task.message && task.status !== 'completed' && <p role="status" className="download-notice">
      {displayError(task.message)}</p>}
    {!connected && !completed && <p className="download-notice">{text("client.downloads.reconnectToTheOriginalComputerToResume")}</p>}
    <div className="download-actions">
      {completed && <button type="button" className="download-button" onClick={open}
        disabled={busy || task.status === 'saving'}><ExternalLink size={17} />{text("client.portForwarding.open")}</button>}
      {completed && share && canShareDownload(task) && <button type="button" className="download-button"
        onClick={share} disabled={busy || task.status === 'saving'}><Share2 size={17} />{text("client.downloads.share")}</button>}
      <button type="button" className="download-button" onClick={action}
        disabled={busy || task.status === 'saving' || (!running && !completed && !connected)}>
        <Icon size={17} />{text(label)}</button>
      <button type="button" className="download-button download-danger" disabled={busy} onClick={remove}>
        <Trash2 size={17} />{text("client.projectBrowser.deleted")}</button>
    </div>
  </article>;
}
