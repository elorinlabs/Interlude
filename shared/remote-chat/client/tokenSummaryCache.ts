import { MAX_SUMMARY_WEEKS, MIN_SUMMARY_WEEKS, type TokenSummary } from '../tokenSummary';
import { decodeTokenSummary, encodeTokenSummary, type TokenSummaryResponse } from '../tokenSummaryCodec';

const STORAGE_PREFIX = 'codex-switch:token-summary:v1:';

export interface TokenSummaryStorage {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
}

export const browserTokenSummaryStorage: TokenSummaryStorage = {
  getItem: key => globalThis.localStorage?.getItem(key) ?? null,
  setItem: (key, value) => globalThis.localStorage?.setItem(key, value),
};

function hasArrays(value: unknown, fields: readonly string[]) {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return fields.every(field => Array.isArray(record[field]));
}

function validRange(data: Partial<TokenSummaryResponse>) {
  return typeof data.weeks === 'number' && Number.isInteger(data.weeks)
    && data.weeks >= MIN_SUMMARY_WEEKS && data.weeks <= MAX_SUMMARY_WEEKS
    && typeof data.refreshSeconds === 'number' && data.refreshSeconds > 0;
}

function isSummary(value: unknown): value is TokenSummaryResponse {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<TokenSummaryResponse>;
  return validRange(data)
    && [data.startTs, data.endTs, data.refreshSeconds, data.thresholdTokens, data.entryCount].every(Number.isFinite)
    && hasArrays(data, ['dateKeys', 'dailyUsage', 'breakdown', 'quotaHistory'])
    && hasArrays(data.rankings, ['providers', 'models', 'accounts']) && !!data.errors;
}

/** Retains the last completed refresh without expiring it while the computer is offline. */
export class TokenSummaryCache {
  private writes = Promise.resolve();
  private readonly key: string;

  constructor(private readonly storage: TokenSummaryStorage, scope: string) {
    this.key = STORAGE_PREFIX + scope;
  }

  async load(): Promise<TokenSummary | null> {
    try {
      const saved: unknown = JSON.parse(await this.storage.getItem(this.key) ?? 'null');
      return isSummary(saved) ? decodeTokenSummary(saved) : null;
    } catch {
      // Missing, damaged or unavailable storage must not prevent a fresh request.
      return null;
    }
  }

  save(data: TokenSummary): Promise<void> {
    this.writes = this.writes.then(() => this.storage.setItem(this.key, JSON.stringify(encodeTokenSummary(data))))
      .catch(() => { /* Keep displaying the successful refresh if local storage is full or unavailable. */ });
    return this.writes;
  }
}
