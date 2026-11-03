import type { HistoryPage, HistoryWindow } from '../historyPage';
import type { Thread } from './types';

export interface CachedConversation { thread: Thread; page: HistoryPage; archived: boolean }
export interface OfflineHistoryStore {
  list(): Promise<{ thread: Thread; archived: boolean }[]>;
  read(id: string, window: HistoryWindow): Promise<CachedConversation | null>;
  save(value: CachedConversation): Promise<void>;
  remove(id: string): Promise<void>;
  updateSummaries?(threads: Thread[], archived: boolean): Promise<void>;
  readImage(key: string): Promise<string | null>;
  saveImage(key: string, url: string): Promise<void>;
}

const SAVE_INTERVAL_MS = 1500;
const MAX_PENDING_THREADS = 8;

/** Coalesce streaming snapshots without postponing writes indefinitely during a long reply. */
export class OfflineWriter {
  private pending = new Map<string, CachedConversation>();
  private timer?: ReturnType<typeof setTimeout>;
  private writing?: Promise<void>;
  private last?: CachedConversation;
  constructor(private store: OfflineHistoryStore, private failed: () => void) {}

  remember(value: CachedConversation) {
    if (value.thread === this.last?.thread && value.archived === this.last.archived) return;
    this.last = value;
    this.pending.set(value.thread.id, value);
    if (this.pending.size > MAX_PENDING_THREADS) {
      this.pending.delete(this.pending.keys().next().value!);
      this.failed();
    }
    if (this.pending.size >= MAX_PENDING_THREADS) { void this.flush(); return; }
    if (!this.timer) this.timer = setTimeout(() => { void this.flush(); }, SAVE_INTERVAL_MS);
  }

  forget(id: string) {
    this.pending.delete(id);
    if (this.last?.thread.id === id) this.last = undefined;
    // Store operations are serialized, including a save already in flight.
    void this.store.remove(id).catch(this.failed);
  }

  flush = (): Promise<void> => {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing) return this.writing;
    this.writing = this.drain().finally(() => { this.writing = undefined; });
    return this.writing;
  };

  private async drain() {
    while (this.pending.size) {
      const [id, value] = this.pending.entries().next().value!;
      this.pending.delete(id);
      try { await this.store.save(value); }
      catch { this.last = undefined; this.failed(); }
    }
  }
}
