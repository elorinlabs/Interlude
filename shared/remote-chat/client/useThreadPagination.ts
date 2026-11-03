import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatController } from './controller';
import type { ChatState } from './types';

function pageKey(state: ChatState) {
  return JSON.stringify([state.archived, state.search, state.cursor]);
}

export function useThreadPagination(state: ChatState, controller: Pick<ChatController, 'list' | 'snapshot'>,
  checkNearEnd?: () => boolean) {
  const [nearEnd, setNearEnd] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failedPage, setFailedPage] = useState<string | null>(null);
  const pending = useRef(false);
  const failed = failedPage === pageKey(state);

  useEffect(() => { setFailedPage(null); }, [controller, state.archived, state.search, state.ready]);

  const loadMore = useCallback(async () => {
    const before = controller.snapshot();
    if (pending.current || !before.ready || before.loading || !before.cursor) return;
    pending.current = true;
    setLoadingMore(true);
    setFailedPage(null);
    try {
      await controller.list({ more: true });
      // A failed request retains its cursor. Pause automatic retries until the user retries.
      if (pageKey(controller.snapshot()) === pageKey(before)) setFailedPage(pageKey(before));
    } catch {
      setFailedPage(pageKey(before));
    } finally {
      pending.current = false;
      setLoadingMore(false);
    }
  }, [controller]);

  useEffect(() => {
    if (nearEnd && state.ready && !state.loading && !loadingMore && state.cursor && !failed
      && (!checkNearEnd || checkNearEnd())) void loadMore();
  }, [nearEnd, state.ready, state.loading, state.cursor, state.archived, state.search,
    loadingMore, failed, loadMore, checkNearEnd]);

  return { setNearEnd, loadingMore, failed, retry: () => { void loadMore(); } };
}
