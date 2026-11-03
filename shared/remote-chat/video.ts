/** Small, seekable reads travel over the authenticated chat connection. */
export const VIDEO_CHUNK_BYTES = 256 * 1024;
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export interface VideoInfo { id: string; size: number; mimeType: typeof VIDEO_MIME_TYPES[number] }
export interface VideoChunk { offset: number; data: string }
export interface VideoRead { threadId: string; id: string; offset: number; length: number }
export type VideoRequest =
  | { operation: 'videoOpen'; threadId: string; path: string; maxBytes?: number }
  | ({ operation: 'videoRead'; maxBytes?: number } & VideoRead)
  | { operation: 'videoClose'; threadId: string; id: string };
export interface VideoClient {
  open: (threadId: string, path: string) => Promise<VideoInfo>;
  read: (request: VideoRead) => Promise<VideoChunk>;
  close: (threadId: string, id: string) => Promise<unknown>;
}
export function isVideoPath(path: string) { return /\.(?:mp4|m4v|mov|webm)$/i.test(path); }
export function validateVideoInfo(info: VideoInfo) {
  if (!info || typeof info.id !== 'string' || !/^[a-z\d-]{36}$/i.test(info.id)
    || !Number.isSafeInteger(info.size) || info.size <= 0
    || !VIDEO_MIME_TYPES.includes(info.mimeType)) throw new Error('视频信息无效，请重试。');
  return info;
}
