import { AlertCircle, ArrowDown, CheckCircle2, Download, ExternalLink, MoreVertical,
  Pause, Play, RotateCw, Share2, Trash2 } from 'lucide-react';
import { Dropdown } from 'antd';
import { displayError } from '../../i18n';
import type { DownloadTask } from '../types';
import { formatBytes } from '../DownloadCard';
import { canShareDownload } from '../shareDownload';
import { downloadCompletionDetails } from '../../../../../shared/downloads/completion';
import { MAX_DOWNLOAD_RETRIES } from '../../../../../shared/remote-chat/downloadRetry';
import { DownloadFileIcon } from './DownloadFileIcon';
import { downloadPercent, downloadStatus, isDownloadReady, isDownloadRunning, remainingTime,
  type DownloadText } from './downloadPresentation';

export interface DownloadItemProps {
  task: DownloadTask; busy: boolean; connected: boolean; selected: boolean; selecting: boolean;
  retryAttempt: number; text: DownloadText; toggle: () => void;
  run: (task: DownloadTask, operation?: 'action' | 'open' | 'remove' | 'share' | 'retry') => void;
  allowShare?: boolean;
}

function TaskMenu({ task, busy, run, text, allowShare, retryAttempt }: DownloadItemProps) {
  const items = [{ key: 'remove', label: text('client.projectBrowser.deleted'),
    icon: <Trash2 size={16} />, danger: true, onClick: () => run(task, 'remove') }];
  const share = allowShare && isDownloadReady(task) && canShareDownload(task)
    ? [{ key: 'share', label: text('client.downloads.share'), icon: <Share2 size={16} />,
      danger: false, onClick: () => run(task, 'share') }] : [];
  const pause = retryAttempt ? [{ key: 'pause', label: text('client.downloads.pause'), icon: <Pause size={16} />,
    danger: false, onClick: () => run(task) }] : [];
  return <Dropdown trigger={['click']} menu={{ items: [...pause, ...share, ...items] }}
    overlayClassName="dw-task-menu" placement="bottomRight">
    <button type="button" className="dw-icon-button" disabled={busy}
      aria-label={text('client.downloads.workspace.taskActions', { name: task.name })}>
      <MoreVertical size={20} />
    </button>
  </Dropdown>;
}

function TaskStatus({ task, retryAttempt, text }: DownloadItemProps) {
  const warning = !!retryAttempt || task.status === 'failed';
  const ready = isDownloadReady(task);
  const Icon = warning ? AlertCircle : ready ? CheckCircle2 : task.status === 'paused' ? Pause : ArrowDown;
  return <span className={`dw-status${warning ? ' is-warning' : ''}${task.status === 'paused' ? ' is-muted' : ''}`}>
    <Icon size={16} /><span>{downloadStatus(task, retryAttempt, text)}
      {task.status === 'preparing' && task.preparation?.phase === 'compressing' && ` · ${downloadPercent(task)}%`}
    </span>
  </span>;
}

function TaskSelection({ task, selected, busy, toggle, text }: DownloadItemProps) {
  return <input type="checkbox" className="dw-checkbox" checked={selected} disabled={busy}
    aria-label={text('client.downloads.selectTask', { name: task.name })} onChange={toggle} />;
}

function TaskNotice({ task, connected, text }: DownloadItemProps) {
  return <>
    {task.message && task.status !== 'completed' && <p role="status" className="dw-notice">
      {displayError(task.message)}</p>}
    {!connected && !isDownloadReady(task) && <p className="dw-notice">
      {text('client.downloads.reconnectToTheOriginalComputerToResume')}</p>}
  </>;
}

export function ActiveDownloadCard(props: DownloadItemProps) {
  const { task, busy, connected, selecting, selected, toggle, retryAttempt, run, text } = props;
  const running = isDownloadRunning(task);
  const retry = !!retryAttempt || task.status === 'failed';
  const label = retry ? 'client.downloads.workspace.retry' : running
    ? 'client.downloads.pause' : 'client.downloads.resumeDownload';
  const Icon = retry ? RotateCw : running ? Pause : Play;
  const percent = downloadPercent(task);
  const remaining = remainingTime(task, text);
  const preparation = task.status === 'preparing' ? task.preparation : undefined;
  return <article className={`dw-active-card${selected ? ' is-selected' : ''}${retry ? ' is-warning' : ''}`}
    aria-label={task.name}>
    <DownloadFileIcon name={task.name} />
    <div className="dw-active-main">
      <div className="dw-active-heading">
        {selecting && <TaskSelection {...props} />}
        <strong onClick={selecting && !busy ? toggle : undefined}>{task.name}</strong>
        <TaskStatus {...props} /><TaskMenu {...props} />
      </div>
      <p className="dw-source">{task.source.deviceName}</p>
      <div className="dw-progress-row">
        <progress max={100} value={percent} aria-label={text(preparation
          ? 'client.downloads.compressionProgress' : 'client.downloads.downloadProgress.38d673',
        { name: task.name })} />
        {percent !== undefined && <span>{percent}%</span>}
        <button type="button" className={`dw-button dw-transfer-action${running && !retry ? ' dw-pause' : ''}`}
          aria-label={text(label)} disabled={busy || ((!running || retry) && !connected)}
          onClick={() => run(task, retry ? 'retry' : 'action')}>
          <Icon size={16} />{(!running || retry) && text(label)}
        </button>
      </div>
      <div className="download-task-meta dw-transfer-meta">
        <span>{preparation ? text('client.downloads.compressedFiles', {
          done: preparation.completedFiles, total: preparation.totalFiles,
        }) : `${formatBytes(task.received)} / ${formatBytes(task.size)}`}</span>
        {retryAttempt > 0 ? <span>{text('client.downloads.workspace.retryAttempt', {
          count: retryAttempt, total: MAX_DOWNLOAD_RETRIES,
        })}</span> : <span className="dw-speed">
          {task.status === 'downloading' && !!task.bytesPerSecond && <span>{formatBytes(task.bytesPerSecond)}/s</span>}
          {remaining && <span>{remaining}</span>}
        </span>}
      </div>
      <TaskNotice {...props} />
    </div>
  </article>;
}

export function ReadyDownloadRow(props: DownloadItemProps) {
  const { task, busy, selected, toggle, run, text } = props;
  const completion = downloadCompletionDetails(task, text);
  return <article className={`dw-ready-row${selected ? ' is-selected' : ''}`} aria-label={task.name}>
    <TaskSelection {...props} /><DownloadFileIcon name={task.name} />
    <div className="dw-file-details" onClick={!busy ? toggle : undefined}>
      <strong>{task.name}</strong>
      <p className="dw-source"><span>{task.source.deviceName}</span>
        <span className="dw-path">{task.source.path}</span></p>
    </div>
    <span className="dw-file-size">{formatBytes(task.size)}</span>
    <div className="dw-ready-status"><TaskStatus {...props} />
      {completion.summary && <p className="download-completion">{completion.summary}</p>}
    </div>
    <div className="dw-row-actions">
      <button type="button" className="dw-button dw-open" onClick={() => run(task, 'open')}
        disabled={busy || task.status === 'saving'}><ExternalLink size={17} />
        {text('client.portForwarding.open')}</button>
      <button type="button" className="dw-button" onClick={() => run(task)} disabled={busy || task.status === 'saving'}>
        <Download size={17} />{text('client.downloads.saveToDevice')}</button>
      <TaskMenu {...props} />
    </div>
    {task.message && task.status !== 'completed'
      && <div className="dw-row-notice"><TaskNotice {...props} /></div>}
  </article>;
}
