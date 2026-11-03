import type { FilePreviewData, FileTarget } from './files';
import { displayText } from '../localization/messages';
import { MAX_JSON_HIGHLIGHT_MB, MEBIBYTE } from '../file-preview/jsonHighlightLimit';

// Even fully escaped JSON stays below the existing relay message limit.
export const PREVIEW_CHUNK_CHARACTERS = 256 * 1024;
export interface FilePreviewReply extends FilePreviewData { textLength?: number }
export interface PreviewTextChunk { offset: number; text: string }
type Request = <T>(body: object) => Promise<T>;
const invalidPreview = () => new Error(displayText('client.workspaceActions.couldNotOpenThePreviewPleaseTryAgainShortly'));

async function readPreviewText(request: Request, data: FilePreviewReply): Promise<FilePreviewData> {
  const { textLength, ...preview } = data;
  if (!Number.isSafeInteger(textLength) || !textLength || textLength < 0
    || textLength > MAX_JSON_HIGHLIGHT_MB * MEBIBYTE) throw invalidPreview();
  const parts: string[] = [];
  for (let offset = 0; offset < textLength;) {
    const length = Math.min(PREVIEW_CHUNK_CHARACTERS, textLength - offset);
    const chunk = await request<PreviewTextChunk>({ operation: 'guiFilePreviewText', id: data.sessionId, offset, length });
    if (chunk.offset !== offset || typeof chunk.text !== 'string' || chunk.text.length !== length) throw invalidPreview();
    parts.push(chunk.text); offset += length;
  }
  return { ...preview, text: parts.join('') };
}

/** Peers predating chunked previews keep returning their existing inline text response. */
export async function openFilePreview(request: Request, target: FileTarget): Promise<FilePreviewData | null> {
  const data = await request<FilePreviewReply | null>({ operation: 'guiFilePreviewOpen', target, chunkedText: true });
  if (!data || data.textLength === undefined) return data;
  try { return await readPreviewText(request, data); }
  catch (error) {
    await request({ operation: 'guiFilePreviewClose', id: data.sessionId })
      .catch(() => console.warn('Remote preview cleanup failed'));
    throw error;
  }
}
