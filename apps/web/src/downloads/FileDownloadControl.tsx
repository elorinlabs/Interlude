import { displayText, displayError } from '../i18n/index';
import { Download, Pause, Play, Share2, X } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import { t } from '../i18n';
import './fileDownload.css';

type DownloadAction = 'download' | 'cancel' | 'pause' | 'resume' | 'save';
const ACTIONS = {
  download: { label: "client.projectBrowser.download", Icon: Download }, cancel: { label: "client.downloads.cancelDownload", Icon: X },
  pause: { label: "client.downloads.pauseDownload", Icon: Pause }, resume: { label: "client.downloads.resumeDownload", Icon: Play },
  save: { label: "client.downloads.saveToDevice", Icon: Download },
};
interface Props {
  action: DownloadAction; onAction: MouseEventHandler<HTMLButtonElement>; disabled: boolean;
  progress?: { percent?: number; status: string; detail: string };
  message?: string; note?: string;
  onShare?: MouseEventHandler<HTMLButtonElement>;
}

/** Keep transfer progress separate from the action so button labels stay stable. */
export function FileDownloadControl({ action, onAction, onShare, disabled, progress, message, note }: Props) {
  const { label, Icon } = ACTIONS[action];
  const secondary = action === 'cancel' || action === 'pause';
  return <div className="file-download-control">
    {progress && <div className="file-download-progress">
      <div className="file-download-progress-heading">
        <span>{displayText(progress.status)}</span><strong>{progress.percent === undefined ? '—' : `${progress.percent}%`}</strong>
      </div>
      <progress max={100} value={progress.percent} aria-label={t("client.downloads.downloadProgress")} />
      {progress.detail && <p className="file-download-detail">{progress.detail}</p>}
    </div>}
    <div className="file-download-actions">
      {onShare && <button type="button" className="file-download-action is-secondary"
        disabled={disabled} onClick={onShare}>
        <Share2 size={16} aria-hidden="true" />{t("client.downloads.shareFile")}</button>}
      <button type="button" className={`file-download-action${secondary ? ' is-secondary' : ''}`}
        disabled={disabled} onClick={onAction}><Icon size={16} aria-hidden="true" />{displayText(label)}</button>
    </div>
    {message && <p role="status" className="file-download-message">{displayError(message)}</p>}
    {note && <p className="file-download-note">{displayText(note)}</p>}
  </div>;
}
