import { t, useLanguage } from '../i18n';
import type { UploadProgress } from '../../../../shared/remote-chat/uploadProgress';
import './uploadProgress.css';

export function ChatUploadProgress({ progress, reconnecting = false, inline = false }: {
  progress?: UploadProgress; reconnecting?: boolean; inline?: boolean;
}) {
  useLanguage();
  if (!progress) return null;
  let label = t("client.chat.uploading");
  if (progress.percent === 0) label = t("client.chat.queued.2b6f8f");
  if (progress.percent === 100) label = t("client.chat.uploaded");
  if (progress.phase === 'preparing') label = t("client.shared.preparing");
  if (progress.phase === 'confirming') label = t("client.chat.finishing");
  if (reconnecting && progress.percent < 100) label = t("client.chat.waiting");
  return <span className={inline ? 'chat-upload-inline' : 'chat-upload-overlay'}
    role="progressbar" aria-label={t("client.chat.attachmentUploadProgress")} aria-valuetext={`${label} ${progress.percent}%`}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
    <span className="chat-upload-percent">{progress.percent}%</span>
    <span className="chat-upload-label">{label}</span>
    {!inline && <span className="chat-upload-track"><i style={{ width: `${progress.percent}%` }} /></span>}
  </span>;
}
