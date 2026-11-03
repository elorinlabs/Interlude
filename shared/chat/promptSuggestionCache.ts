import type { PromptSuggestionTarget, RequestPromptSuggestion } from './nextPromptSuggestion';

const STORAGE_PREFIX = 'codex-switch:prompt-suggestions:v1:';
const MAX_SAVED_TURNS = 256;
const MAX_SUGGESTION_CHARS = 100;

export interface PromptSuggestionStorage {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
}

export const browserSuggestionStorage: PromptSuggestionStorage = {
  getItem: key => globalThis.localStorage?.getItem(key) ?? null,
  setItem: (key, value) => globalThis.localStorage?.setItem(key, value),
};

function validSuggestion(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
    && Array.from(value).length <= MAX_SUGGESTION_CHARS && !/[\r\n\t]/.test(value);
}

/** A draft or background refresh never invalidates a suggestion for the same completed turn. */
export class PromptSuggestionCache {
  private readonly entries = new Map<string, string>();
  private readonly requests = new Map<string, Promise<void>>();
  private hydration?: Promise<void>;
  private writes = Promise.resolve();
  private readonly storageKey: string;

  constructor(private readonly storage: PromptSuggestionStorage, scope: string) {
    this.storageKey = STORAGE_PREFIX + scope;
  }

  get(key: string) { return this.entries.get(key) ?? ''; }

  load(): Promise<void> {
    this.hydration ??= this.restore();
    return this.hydration;
  }

  private async restore() {
    try {
      const saved: unknown = JSON.parse(await this.storage.getItem(this.storageKey) ?? '[]');
      if (!Array.isArray(saved)) return;
      for (const entry of saved.slice(-MAX_SAVED_TURNS)) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && validSuggestion(entry[1])) {
          this.entries.set(entry[0], entry[1]);
        }
      }
    } catch { /* Suggestions remain available in memory if local storage is unavailable. */ }
  }

  request(key: string, target: PromptSuggestionTarget, request: RequestPromptSuggestion): Promise<void> {
    if (this.entries.has(key)) return Promise.resolve();
    const pending = this.requests.get(key);
    if (pending) return pending;
    const result = this.generate(key, target, request);
    this.requests.set(key, result);
    return result;
  }

  private async generate(key: string, target: PromptSuggestionTarget, request: RequestPromptSuggestion) {
    let text = '';
    try {
      const response = await request(target);
      if (validSuggestion(response.suggestion)) text = response.suggestion.trim();
    } catch { /* Optional predictions must never interrupt ordinary chat or retry in a loop. */ }
    this.requests.delete(key);
    this.entries.set(key, text);
    if (this.entries.size > MAX_SAVED_TURNS) this.entries.delete(this.entries.keys().next().value!);
    const saved = JSON.stringify([...this.entries].filter(([, value]) => value));
    this.writes = this.writes.then(() => this.storage.setItem(this.storageKey, saved))
      .catch(() => { /* Keep the in-memory result when persistence fails. */ });
    await this.writes;
  }
}
