import type { GuiEvent, ListResponse, Thread } from './types';

export interface ThreadListQuery { search?: string; archived: boolean; cursor?: string; limit?: number }
type Scope = Omit<ThreadListQuery, 'cursor'>;
type Snapshot = ListResponse<Thread>;
interface CachedList { query: ThreadListQuery; snapshot: Snapshot; valid: boolean }
interface Change { revision: number; thread?: Thread; archived?: boolean; removed?: boolean }
const keyOf = (query: Scope) => JSON.stringify([query.search ?? '', query.archived]);
const summary = ({ turns: _turns, ...thread }: Thread): Thread => thread;

/** Session-owned summaries only. History has its own bounded cache and is never retained here. */
export class ThreadListCache {
  private lists = new Map<string, CachedList>();
  private changes = new Map<string, Change>();
  private known = new Map<string, Thread>();
  private archived = new Map<string, boolean>();
  private preceding = new Map<string, string | null>();
  private pending = new Map<string, Promise<Snapshot>>();
  private revision = 0;
  private epoch = 0;

  constructor(private readonly fetch: (query: ThreadListQuery, force?: boolean) => Promise<Snapshot>) {}

  peek(query: Scope): Snapshot | undefined { return this.lists.get(keyOf(query))?.snapshot; }

  get(query: Scope): Snapshot | undefined {
    const cached = this.lists.get(keyOf(query));
    return cached?.valid ? cached.snapshot : undefined;
  }

  invalidate() {
    for (const list of this.lists.values()) list.valid = false;
    this.epoch += 1;
    this.pending.clear();
  }

  read(query: ThreadListQuery, force = false): Promise<Snapshot> {
    const cached = !query.cursor && !force ? this.get(query) : undefined;
    if (cached) return Promise.resolve(cached);
    const key = JSON.stringify([keyOf(query), query.cursor]);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const revision = this.revision;
    const epoch = this.epoch;
    const request = this.fetch(query, force).then(result => {
      const data = query.cursor ? [...(this.peek(query)?.data ?? []), ...result.data] : result.data;
      let snapshot = { data: [...new Map(data.map(thread => [thread.id, summary(thread)])).values()],
        nextCursor: result.nextCursor };
      for (const [id, change] of this.changes) {
        if (change.revision > revision) snapshot = this.apply(snapshot, query, id, change);
      }
      if (epoch === this.epoch) {
        const valid = !query.cursor || Boolean(this.get(query));
        this.lists.set(keyOf(query), { query, snapshot, valid });
        for (const thread of snapshot.data) {
          this.known.set(thread.id, thread);
          this.archived.set(thread.id, query.archived);
          const change = this.changes.get(thread.id);
          if (change && change.revision <= revision) {
            this.changes.set(thread.id, { thread, archived: query.archived, revision: change.revision });
          }
        }
      }
      return snapshot;
    }).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request);
    return request;
  }

  private find(id: string) {
    return this.known.get(id);
  }

  has(id: string) { return this.known.has(id); }

  /** A removed cursor row continues after its surviving predecessor instead of skipping the next chat. */
  offsetAfter(query: Scope, after: string | undefined, fallback: number) {
    const data = this.peek(query)?.data ?? [];
    const visited = new Set<string>();
    while (after && !visited.has(after)) {
      visited.add(after);
      const index = data.findIndex(thread => thread.id === after);
      if (index >= 0) return index + 1;
      const previous = this.preceding.get(JSON.stringify([keyOf(query), after]));
      if (previous === null) return 0;
      if (previous === undefined) break;
      after = previous;
    }
    return fallback;
  }

  upsert(thread: Thread, archived?: boolean) {
    this.change(thread.id, { thread: summary(thread), archived });
  }

  remove(id: string) { this.change(id, { removed: true }); }

  /** Successful local writes also update cached tabs that are not currently visible. */
  observe(before: Thread[], after: Thread[], archived: boolean) {
    if (before === after) return;
    const previous = new Map(before.map(thread => [thread.id, thread]));
    for (const thread of after) {
      if (thread === previous.get(thread.id)) continue;
      const cached = this.find(thread.id);
      if (cached && cached.name === thread.name && cached.preview === thread.preview && cached.cwd === thread.cwd
        && cached.updatedAt === thread.updatedAt && cached.status?.type === thread.status?.type) continue;
      this.upsert(thread, archived);
    }
  }

  private change(id: string, change: Omit<Change, 'revision'>) {
    const previous = this.known.get(id);
    const membershipChanged = !change.removed && (!previous || (change.thread
      && (previous.name !== change.thread.name || previous.preview !== change.thread.preview))
      || (change.archived !== undefined && change.archived !== this.archived.get(id)));
    const next = { ...change, archived: change.archived ?? this.archived.get(id),
      revision: ++this.revision };
    this.changes.set(id, next);
    if (next.archived !== undefined) this.archived.set(id, next.archived);
    if (change.removed) this.known.delete(id);
    else if (change.thread) this.known.set(id, change.thread);
    for (const list of this.lists.values()) {
      list.snapshot = this.apply(list.snapshot, list.query, id, next);
      // Search semantics belong to the host; a title/preview change can introduce new matches.
      if (list.query.search && membershipChanged) list.valid = false;
    }
  }

  private apply(snapshot: Snapshot, query: ThreadListQuery, id: string, change: Change): Snapshot {
    const exists = snapshot.data.some(thread => thread.id === id);
    const excluded = change.removed || (change.archived !== undefined
      && change.archived !== Boolean(query.archived));
    if (excluded) {
      const index = snapshot.data.findIndex(thread => thread.id === id);
      if (index >= 0) this.preceding.set(JSON.stringify([keyOf(query), id]), snapshot.data[index - 1]?.id ?? null);
      return { ...snapshot, data: snapshot.data.filter(thread => thread.id !== id) };
    }
    if (!change.thread) return snapshot;
    if (exists) {
      const data = snapshot.data.map(thread => thread.id === id ? change.thread! : thread);
      if (snapshot.data.find(thread => thread.id === id)?.updatedAt !== change.thread.updatedAt) {
        data.sort((left, right) => right.updatedAt - left.updatedAt);
      }
      return { ...snapshot, data };
    }
    if (query.search || change.archived === undefined) return snapshot;
    return { ...snapshot, data: [change.thread, ...snapshot.data].sort((left, right) => right.updatedAt - left.updatedAt) };
  }

  /** Returns true when the notification needs metadata that was not supplied by the host. */
  receive(event: GuiEvent): boolean {
    const { method, params } = event;
    const id = params.threadId ?? params.thread?.id;
    if (!id) return false;
    if (method === 'thread/deleted') { this.remove(id); return false; }
    if (this.changes.get(id)?.removed) return false;
    if (params.thread) { this.upsert(params.thread, method === 'thread/archived'); return false; }
    const current = this.find(id);
    const lifecycle = ['thread/name/updated', 'thread/archived', 'thread/unarchived',
      'turn/started', 'turn/completed'].includes(method);
    if (!current) { if (lifecycle) this.invalidate(); return lifecycle; }
    if (method === 'thread/name/updated' && params.threadName !== undefined) {
      this.upsert({ ...current, name: params.threadName });
    }
    if (method === 'thread/archived' || method === 'thread/unarchived') {
      this.upsert(current, method === 'thread/archived');
    }
    if (method === 'turn/started' || method === 'turn/completed') {
      const updatedAt = method === 'turn/completed'
        ? Math.max(current.updatedAt, params.turn?.completedAt ?? Math.floor(Date.now() / 1000)) : current.updatedAt;
      this.upsert({ ...current, updatedAt, status: { type: method === 'turn/started' ? 'active' : 'idle' } });
    }
    if (!current.preview && params.item?.type === 'userMessage') {
      const preview = params.item.content?.flatMap(part => typeof part === 'object' && part.type === 'text'
        ? [part.text ?? ''] : []).join(' ') ?? '';
      if (preview) this.upsert({ ...current, preview });
    }
    return false;
  }
}
