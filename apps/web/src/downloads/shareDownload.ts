import { Dialog } from 'antd-mobile';
import { t } from '../i18n';
import { verifiedDownloadContent } from './openDownload';
import type { DownloadTask } from './types';

export class DownloadShareError extends Error {}

function shareFile(task: DownloadTask, content: BlobPart[] = []) {
  return new File(content, task.name, { type: task.mimeType || 'application/octet-stream' });
}

export function canShareDownload(task: DownloadTask) {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try { return navigator.canShare({ files: [shareFile(task)] }); }
  catch { return false; }
}

export async function shareBrowserDownload(task: DownloadTask) {
  if (!canShareDownload(task)) {
    throw new DownloadShareError('此浏览器无法分享此文件，请先保存到设备后分享。');
  }
  const file = shareFile(task, [await verifiedDownloadContent(task)]);
  if (!navigator.canShare({ files: [file] })) {
    throw new DownloadShareError('此浏览器无法分享此文件，请先保存到设备后分享。');
  }
  // Reading and verifying a large file can outlast the browser's user activation.
  // Share from a fresh click in that case, without loading every completed file into memory.
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    const confirmed = await Dialog.confirm({ title: t("client.downloads.shareFile"), content: task.name,
      confirmText: t("client.downloads.share"), cancelText: t("client.accounts.cancel"), bodyStyle: { maxWidth: 400, overflowWrap: 'anywhere' } });
    if (!confirmed) return;
  }
  try { await navigator.share({ files: [file] }); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    throw new DownloadShareError('分享未完成，请重试或保存到设备后分享。');
  }
}
