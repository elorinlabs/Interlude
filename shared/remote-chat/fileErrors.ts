import { BulkError, type BulkErrorCode } from './bulkLimits';

// Desktop RPC errors are already user-safe. Match known messages so arbitrary transport
// exceptions (which can contain paths or connection details) never become UI copy.
const fileErrors = new Map<string, BulkErrorCode>([
  ['文件暂时无法下载，请确认文件仍在当前项目中。', 'FILE_UNAVAILABLE'],
  ['文件暂时无法读取，请确认文件存在且有读取权限。', 'FILE_UNAVAILABLE'],
  ['文件暂时无法读取，请确认文件仍在当前项目中，且大小未超过查看上限。', 'PREVIEW_UNAVAILABLE'],
  ['文件暂时无法预览，请确认文件可访问、内容为文本且未超过查看上限。', 'PREVIEW_UNAVAILABLE'],
  ['图片暂时无法显示，请确认文件仍在当前任务目录中。', 'PREVIEW_UNAVAILABLE'],
  ['图片暂时无法显示，请确认文件可访问且图片格式受支持。', 'PREVIEW_UNAVAILABLE'],
  ['文件超过当前传输大小上限。', 'FILE_TOO_LARGE'],
  ['文件夹超过当前下载大小上限。', 'FILE_TOO_LARGE'],
]);

export function normalizeFileError(error: unknown): unknown {
  if (error instanceof BulkError) return error;
  const code = error instanceof Error ? fileErrors.get(error.message) : undefined;
  return code ? new BulkError(code) : error;
}

export function filePreviewError(error: unknown, fallback: string): string {
  const normalized = normalizeFileError(error);
  if (normalized instanceof BulkError) return normalized.message;
  // Managed previews propagate a persisted, already sanitized message as a plain Error.
  return error instanceof Error && [
    'FILE_UNAVAILABLE', 'PREVIEW_UNAVAILABLE', 'FILE_TOO_LARGE', 'PATH_UNAVAILABLE', 'STORAGE_FAILED',
  ].some(code => new BulkError(code as BulkErrorCode).message === error.message) ? error.message : fallback;
}
