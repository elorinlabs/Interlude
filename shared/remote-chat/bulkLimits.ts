import canonicalCopy from '@interlude/i18n/copy/client/bulkErrors';
/** Conservative application budgets; none of these enlarge the RPC delivery window. */
export const BULK_LIMITS = {
  version: 1, blockBytes: 1024 * 1024, recordBytes: 16 * 1024,
  peerRequestBytes: 2 * 1024 * 1024, maxPeerRequestBytes: 8 * 1024 * 1024,
  globalRequestBytes: 16 * 1024 * 1024, applicationBytes: 32 * 1024 * 1024,
  transportHighBytes: 256 * 1024, transportLowBytes: 64 * 1024,
  sendBatchRecords: 16,
  activeFiles: 2, hashesPerPage: 256, maxBlocks: 65_536,
  commitBytes: 4 * 1024 * 1024, commitMs: 250, progressMs: 250,
  stallMs: 30_000, prepareMs: 15 * 60_000, hashRetries: 2,
} as const;

export type BulkErrorCode = 'INVALID_RECORD' | 'INVALID_MANIFEST' | 'SOURCE_CHANGED' | 'INTEGRITY_FAILED'
  | 'REPLAY' | 'EPOCH_EXPIRED' | 'CREDIT_EXCEEDED' | 'RESOURCE_LIMIT' | 'STORAGE_FAILED'
  | 'PATH_UNAVAILABLE' | 'CANCELLED' | 'FILE_UNAVAILABLE' | 'PREVIEW_UNAVAILABLE' | 'FILE_TOO_LARGE';

const messages: Record<BulkErrorCode, string> = canonicalCopy;

export class BulkError extends Error {
  constructor(readonly code: BulkErrorCode) { super(messages[code]); }
}

export function bulkError(error: unknown) {
  if (error instanceof BulkError) return error;
  const code = error instanceof Error ? error.message : String(error);
  return new BulkError(Object.prototype.hasOwnProperty.call(messages, code) ? code as BulkErrorCode : 'INTEGRITY_FAILED');
}

export function bulkAssert(condition: unknown, code: BulkErrorCode): asserts condition {
  if (!condition) throw new BulkError(code);
}
