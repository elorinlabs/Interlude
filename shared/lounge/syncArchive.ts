import { historyKey, type HistoryCursor, type LoungeHistoryStore } from './archive';
import { messageConversation } from './contacts';
import { mergeDelivery, receiptRank } from './delivery';
import { parseMessage, type LoungeMessage } from './types';

export const SYNC_PAGE_SIZE = 25;
export interface HistoryEntry { key: string; conversation: string; generation: number; status: string }
export interface HistoryManifest { entries: HistoryEntry[]; next?: HistoryCursor }
export interface HistorySyncAccess {
  generations: (peers: string[]) => Promise<Record<string, number>>;
}

export function syncEntry(message: LoungeMessage): HistoryEntry {
  return { key: historyKey(message), conversation: message.conversation ?? '', generation: message.generation ?? 0,
    status: message.delivery?.status ?? '' };
}

export function validHistoryKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 200) return false;
  try {
    const parts: unknown = JSON.parse(value);
    return Array.isArray(parts) && parts.length === 2 && parts.every(part =>
      typeof part === 'string' && part.length > 0 && part.length <= 80) && JSON.stringify(parts) === value;
  } catch { return false; }
}

export function historyCursor(value: unknown): HistoryCursor | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object') throw new Error('invalid-history-cursor');
  const cursor = value as HistoryCursor;
  if (!Number.isSafeInteger(cursor.time) || !validHistoryKey(cursor.key)) throw new Error('invalid-history-cursor');
  return { time: cursor.time, key: cursor.key };
}

export function parseManifest(value: unknown): HistoryManifest {
  if (!value || typeof value !== 'object') throw new Error('invalid-history-manifest');
  const manifest = value as HistoryManifest;
  if (!Array.isArray(manifest.entries) || manifest.entries.length > SYNC_PAGE_SIZE) {
    throw new Error('invalid-history-manifest');
  }
  for (const entry of manifest.entries) {
    if (!entry || !validHistoryKey(entry.key) || typeof entry.conversation !== 'string'
      || entry.conversation.length > 80 || !Number.isSafeInteger(entry.generation) || entry.generation < 0
      || !['', 'pending', 'rejected', 'delivered', 'read'].includes(entry.status)) {
      throw new Error('invalid-history-entry');
    }
  }
  return { entries: manifest.entries, next: historyCursor(manifest.next) };
}

/** Validates ownership again inside the encrypted channel; remote fields never choose a local account/archive. */
export function syncMessage(value: unknown, owner: string): LoungeMessage | undefined {
  const message = parseMessage(value);
  if (!message || !validHistoryKey(historyKey(message))) return;
  if (message.recipient && message.sender.id !== owner && message.recipient.id !== owner) return;
  const conversation = messageConversation(message, owner);
  const delivery = message.delivery;
  if (!message.recipient) return { ...message, conversation: undefined, delivery: undefined };
  const direction = message.sender.id === owner ? 'outgoing' : 'incoming';
  const status = direction === 'incoming' ? (delivery?.status === 'read' ? 'read' : 'delivered')
    : delivery?.status ?? 'delivered';
  // Only the originating device owns its outbox and receipt retry jobs.
  return { ...message, conversation, delivery: { direction, status, retry: false,
    confirmed: direction === 'incoming' ? status as 'read' | 'delivered' : undefined } };
}

export class SyncArchive {
  constructor(private readonly options: {
    owner: string; store: LoungeHistoryStore; flush: () => Promise<void>;
    restored: (messages: LoungeMessage[]) => void; current: () => boolean;
    accept: (message: LoungeMessage) => boolean;
  }) {}

  async manifest(before?: HistoryCursor): Promise<HistoryManifest> {
    await this.options.flush();
    const page = await this.options.store.page({ query: '', before, limit: SYNC_PAGE_SIZE });
    return { entries: page.messages.map(message => syncMessage(message, this.options.owner))
      .filter((message): message is LoungeMessage => !!message).map(syncEntry), next: page.next };
  }

  async read(key: string) {
    await this.options.flush();
    const message = await this.options.store.get?.(key);
    return syncMessage(message, this.options.owner) ?? null;
  }

  async missing(entries: HistoryEntry[], access: HistorySyncAccess) {
    const generations = await access.generations([...new Set(entries.map(entry => entry.conversation).filter(Boolean))]);
    const missing: string[] = [];
    for (const entry of entries) {
      if (entry.conversation && generations[entry.conversation] !== entry.generation) continue;
      const previous = await this.read(entry.key);
      if (!previous || receiptRank(entry.status) > receiptRank(previous.delivery?.status)
        || entry.status === 'rejected' && previous.delivery?.status === 'pending') missing.push(entry.key);
    }
    return missing;
  }

  async import(key: string, value: unknown, access: HistorySyncAccess) {
    const incoming = syncMessage(value, this.options.owner);
    if (!incoming || historyKey(incoming) !== key) return;
    if (incoming.conversation) {
      const generations = await access.generations([incoming.conversation]);
      if (generations[incoming.conversation] !== (incoming.generation ?? 0)) return;
    }
    await this.options.flush();
    const previous = await this.options.store.get?.(key);
    if (!this.options.current() || !this.options.accept(incoming)) return;
    const message = previous ? { ...previous, delivery: mergeDelivery(previous.delivery, incoming.delivery) } : incoming;
    if (previous && previous.delivery?.status === message.delivery?.status
      && previous.delivery?.confirmed === message.delivery?.confirmed) return;
    await this.options.store.save(message);
    if (!this.options.accept(incoming) && incoming.conversation) {
      await this.options.store.deleteConversation?.(incoming.conversation, (incoming.generation ?? 0) + 1);
      return;
    }
    const saved = await this.options.store.get?.(key);
    if (saved && this.options.current() && this.options.accept(saved)) this.options.restored([saved]);
  }
}
