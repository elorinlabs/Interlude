import { BulkError } from './bulkLimits';
import { DownloadCancelled, DownloadValidationError } from './fileDownload';
import { DownloadPolicyError } from './policy';

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;
export const MAX_DOWNLOAD_RETRIES = RETRY_DELAYS_MS.length;

export function canRetryDownload(error: unknown) {
  if (error instanceof DownloadCancelled || error instanceof DownloadPolicyError
    || error instanceof DownloadValidationError) return false;
  if (error instanceof BulkError) return ['PATH_UNAVAILABLE', 'EPOCH_EXPIRED', 'RESOURCE_LIMIT'].includes(error.code);
  return !(error instanceof DOMException && ['AbortError', 'QuotaExceededError'].includes(error.name));
}

/** Five automatic retries per run; only explicit resumption starts a new budget. */
export class DownloadRetry {
  private attempts = new Map<string, number>();

  next(id: string) {
    const count = this.attempts.get(id) ?? 0;
    const delay = RETRY_DELAYS_MS[count];
    if (delay !== undefined) this.attempts.set(id, count + 1);
    return delay;
  }

  clear(id: string) { this.attempts.delete(id); }
  attempt(id: string) { return this.attempts.get(id) ?? 0; }
}
