import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteGit } from './useRemoteGit';

export const GIT_HISTORY_LOAD_DISTANCE = 160;

export function gitHistoryPageKey(panel: RemoteGit) {
  return JSON.stringify([panel.changes?.root, panel.changes?.branch,
    panel.commits[0]?.hash, panel.commits.at(-1)?.hash, panel.commits.length]);
}

export function useGitHistoryPagination(panel: RemoteGit, connected: boolean, checkNearEnd: () => boolean) {
  const [nearEnd, setNearEnd] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attemptedPage, setAttemptedPage] = useState<string | null>(null);
  const pending = useRef(false);
  const pageKey = gitHistoryPageKey(panel);
  // An unchanged page after a request means it failed or made no progress. Wait for an explicit retry.
  const failed = attemptedPage === pageKey && !loadingMore;
  const { busy, hasMore, more } = panel;
  const loadMore = useCallback(async () => {
    if (pending.current || busy || !connected || !hasMore) return;
    pending.current = true;
    setLoadingMore(true);
    setAttemptedPage(pageKey);
    try { await more(); }
    finally { pending.current = false; setLoadingMore(false); }
  }, [busy, connected, hasMore, more, pageKey]);

  useEffect(() => {
    if (!nearEnd || failed || loadingMore) return;
    if (checkNearEnd()) void loadMore();
    else setNearEnd(false);
  }, [nearEnd, failed, loadingMore, checkNearEnd, loadMore]);

  return { setNearEnd, loadingMore, failed, retry: () => { void loadMore(); } };
}
