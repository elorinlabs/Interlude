import { downloadContent } from './storage';
import { verifySnapshot } from './saveDownload';
import type { DownloadTask } from './types';

export type DownloadOpener = (task: DownloadTask) => Promise<void>;
const OPEN_URL_LIFETIME_MS = 60_000;
const TEXT_EXTENSIONS =
  /\.(txt|md|mdx|log|csv|tsv|json|xml|ya?ml|toml|ini|cfg|html?|css|[cm]?js|tsx?|jsx|py|rs|go|sh|sql|svg)$/i;

export class DownloadOpenError extends Error {}

function previewType(task: DownloadTask) {
  const mime = task.mimeType?.split(';')[0].toLowerCase() ?? '';
  // Active documents (including HTML/SVG) must never execute in this application's origin.
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.test(task.name)) return 'text/plain;charset=utf-8';
  if (/^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(mime)
    || /^(audio|video)\/[a-z0-9.+-]+$/.test(mime) || mime === 'application/pdf') return mime;
  throw new DownloadOpenError('此文件需使用设备上的应用打开，请先保存到设备。');
}

export async function verifiedDownloadContent(task: DownloadTask) {
  const blob = await downloadContent(task);
  await verifySnapshot(task, blob);
  return blob;
}

export async function openBrowserDownload(task: DownloadTask) {
  const type = previewType(task);
  // Reserve the tab in the click stack before IndexedDB or verification consumes user activation.
  const tab = window.open('about:blank', '_blank');
  if (!tab) throw new DownloadOpenError('无法打开文件，请允许弹出窗口后重试。');
  tab.opener = null;
  try {
    const blob = await verifiedDownloadContent(task);
    if (tab.closed) return;
    const url = URL.createObjectURL(blob.slice(0, blob.size, type));
    try { tab.location.replace(url); }
    finally { setTimeout(() => URL.revokeObjectURL(url), OPEN_URL_LIFETIME_MS); }
  } catch (error) { tab.close(); throw error; }
}
