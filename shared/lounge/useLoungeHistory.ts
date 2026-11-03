import { useEffect, useState, useSyncExternalStore } from 'react';
import type { LoungeController } from './controller';
import type { HistoryCursor, HistoryPage } from './archive';

const SEARCH_DELAY_MS = 250;

/** Shared paged search; stale account, query and page results must never replace the current view. */
export function useLoungeHistory(controller: LoungeController, open: boolean) {
  const { historyRevision, conversation } = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ query: '', cursors: [] as HistoryCursor[] });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ owner: LoungeController; search: typeof search; page: HistoryPage;
    loading: boolean; error: boolean }>();
  useEffect(() => {
    const timer = setTimeout(() => setSearch({ query, cursors: [] }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, controller, conversation]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setResult(previous => ({ owner: controller, search, loading: true, error: false,
      page: previous?.owner === controller && previous.search === search ? previous.page : { messages: [] } }));
    void controller.searchHistory({ query: search.query, before: search.cursors.at(-1) }).then(page => {
      if (active) setResult({ owner: controller, search, page, loading: false, error: false });
    }).catch(() => {
      if (active) setResult({ owner: controller, search, page: { messages: [] }, loading: false, error: true });
    });
    return () => { active = false; };
  }, [controller, open, search, historyRevision, attempt, conversation]);
  const current = result?.owner === controller && result.search === search && search.query === query ? result : undefined;
  return {
    query, setQuery, messages: current?.page.messages ?? [], loading: !current || current.loading,
    error: current?.error ?? false, hasPrevious: search.cursors.length > 0, hasNext: !!current?.page.next,
    retry: () => setAttempt(value => value + 1),
    previous: () => setSearch(value => ({ ...value, cursors: value.cursors.slice(0, -1) })),
    next: () => {
      const cursor = current?.page.next;
      if (cursor) setSearch(value => ({ ...value, cursors: [...value.cursors, cursor] }));
    },
  };
}
