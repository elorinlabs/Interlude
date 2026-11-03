import type { ThreadListCache, ThreadListQuery } from './threadListCache';

const CURSOR_PREFIX = 'memory-thread-list:';
interface Position { offset: number; after?: string; scope: string }
const scopeOf = (query: ThreadListQuery) => JSON.stringify([query.search ?? '', query.archived]);

function position(query: ThreadListQuery): Position {
  if (!query.cursor) return { offset: 0, scope: scopeOf(query) };
  if (!query.cursor.startsWith(CURSOR_PREFIX)) throw new Error('Invalid request');
  const parsed: unknown = JSON.parse(query.cursor.slice(CURSOR_PREFIX.length));
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid request');
  const value = parsed as Partial<Position>;
  if (!Number.isSafeInteger(value.offset) || value.offset! < 0 || typeof value.after !== 'string'
    || value.scope !== scopeOf(query)) throw new Error('Invalid request');
  return value as Position;
}

/** Serve bounded remote pages from the same summaries used by the local sidebar. */
export async function readThreadListPage(cache: ThreadListCache, query: ThreadListQuery,
  options: { pageSize: number; force?: boolean }) {
  // A client connected before this host upgraded may still hold a backend cursor.
  if (query.cursor && !query.cursor.startsWith(CURSOR_PREFIX)) {
    const snapshot = await cache.read({ ...query, limit: options.pageSize }, options.force);
    return { ...snapshot, data: snapshot.data.slice(-options.pageSize) };
  }
  const target = position(query);
  const { cursor: _cursor, ...rest } = query;
  const scope = { ...rest, limit: options.pageSize };
  let snapshot = await cache.read(scope, options.force);
  const cursors = new Set<string>();
  const offset = () => cache.offsetAfter(query, target.after, target.offset);
  while (snapshot.nextCursor && snapshot.data.length < offset() + options.pageSize) {
    if (cursors.has(snapshot.nextCursor)) break;
    cursors.add(snapshot.nextCursor);
    snapshot = await cache.read({ ...scope, cursor: snapshot.nextCursor });
  }
  const start = offset();
  const data = snapshot.data.slice(start, start + options.pageSize);
  const end = start + data.length;
  const nextCursor = data.length && (end < snapshot.data.length || snapshot.nextCursor)
    ? CURSOR_PREFIX + JSON.stringify({ offset: end, after: data.at(-1)!.id, scope: target.scope }) : null;
  return { data, nextCursor };
}
