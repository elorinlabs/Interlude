import { ChatRpc } from '../remote-chat/rpc';
import type { RpcMessage, RpcRequest } from '../remote-chat/protocol';
import type { HistoryCursor } from './archive';
import { historyCursor, parseManifest, validHistoryKey, type SyncArchive, type HistorySyncAccess } from './syncArchive';

const PROTOCOL = 'lounge-history-v1';
const MAX_CHANGED_KEYS = 100;
const MAX_REQUESTS = 4;

/** One bounded pull at a time; only missing records and advancing receipt states cross the link. */
export class HistoryExchange {
  private readonly rpc: ChatRpc;
  private closed = false;
  private active = false;
  private scanning = true;
  private serving = false;
  private readonly requests: RpcRequest[] = [];
  private readonly changed = new Set<string>();

  constructor(private readonly options: {
    archive: SyncArchive; access: HistorySyncAccess; send: (message: RpcMessage) => Promise<void>;
    failed: () => void;
  }) {
    this.rpc = new ChatRpc({ send: options.send, prefix: 'history', event: value => this.event(value) });
  }

  receive(message: RpcMessage) {
    if (this.closed) return;
    if (message.kind === 'request') { this.enqueue(message); return; }
    this.rpc.receive(message);
  }

  start() { void this.pull(); }

  changedHere(key: string) {
    if (!this.closed) void this.options.send({ kind: 'event', event: { protocol: PROTOCOL, key } })
      .catch(() => { if (!this.closed) this.options.failed(); });
  }

  private event(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const event = value as { protocol?: unknown; key?: unknown };
    if (event.protocol !== PROTOCOL || !validHistoryKey(event.key)) return;
    if (this.changed.size < MAX_CHANGED_KEYS) this.changed.add(event.key);
    else this.scanning = true;
    void this.pull();
  }

  private enqueue(message: RpcRequest) {
    if (message.method !== 'request' || typeof message.id !== 'string' || message.id.length > 80) return;
    if (this.requests.length >= MAX_REQUESTS) { this.options.failed(); return; }
    this.requests.push(message);
    void this.serve();
  }

  private async serve() {
    if (this.serving || this.closed) return;
    this.serving = true;
    try {
      while (!this.closed && this.requests.length) await this.respond(this.requests.shift()!);
    } finally { this.serving = false; }
  }

  private async respond(message: RpcRequest) {
    try {
      const data = await this.answer(message.body);
      if (!this.closed) await this.options.send({ kind: 'response', id: message.id, data });
    } catch {
      if (!this.closed) await this.options.send({ kind: 'response', id: message.id, error: 'history-unavailable' })
        .catch(() => { if (!this.closed) this.options.failed(); });
    }
  }

  private answer(value: unknown) {
    if (!value || typeof value !== 'object') throw new Error('invalid-history-request');
    const body = value as { protocol?: unknown; operation?: unknown; before?: unknown; key?: unknown };
    if (body.protocol !== PROTOCOL) throw new Error('invalid-history-protocol');
    if (body.operation === 'manifest') return this.options.archive.manifest(historyCursor(body.before));
    if (body.operation === 'record' && validHistoryKey(body.key)) return this.options.archive.read(body.key);
    throw new Error('invalid-history-operation');
  }

  private async record(key: string) {
    const value = await this.rpc.request('request', { protocol: PROTOCOL, operation: 'record', key });
    if (!this.closed) await this.options.archive.import(key, value, this.options.access);
  }

  private async scan() {
    let before: HistoryCursor | undefined;
    do {
      const page = parseManifest(await this.rpc.request('request', { protocol: PROTOCOL, operation: 'manifest', before }));
      if (this.closed) return;
      if (page.next && before && (page.next.time > before.time
        || page.next.time === before.time && page.next.key >= before.key)) throw new Error('invalid-history-pagination');
      const keys = await this.options.archive.missing(page.entries, this.options.access);
      for (const key of keys) { if (this.closed) return; await this.record(key); }
      before = page.next;
    } while (before && !this.closed);
  }

  private async pull() {
    if (this.closed || this.active) return;
    this.active = true;
    try {
      while (!this.closed && (this.scanning || this.changed.size)) {
        if (this.scanning) { this.scanning = false; await this.scan(); }
        const keys = [...this.changed]; this.changed.clear();
        for (const key of keys) { if (this.closed) return; await this.record(key); }
      }
    } catch { if (!this.closed) this.options.failed(); }
    finally { this.active = false; }
  }

  close() { this.closed = true; this.changed.clear(); this.requests.length = 0; this.rpc.close(); }
}
