import { useCallback, useEffect, useRef } from 'react';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { GIT_HISTORY_LOAD_DISTANCE, useGitHistoryPagination }
  from '../../../../../shared/remote-chat/useGitHistoryPagination';

export function useGitHistoryScroll(panel: RemoteGit, connected: boolean) {
  const list = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const checkNearEnd = useCallback(() => {
    const node = list.current;
    return !!node && node.clientHeight > 0
      && node.scrollHeight - node.scrollTop - node.clientHeight <= GIT_HISTORY_LOAD_DISTANCE;
  }, []);
  const { setNearEnd, ...pagination } = useGitHistoryPagination(panel, connected, checkNearEnd);

  useEffect(() => {
    if (!list.current || !end.current) return;
    const observer = new IntersectionObserver(() => setNearEnd(checkNearEnd()), {
      root: list.current, rootMargin: `0px 0px ${GIT_HISTORY_LOAD_DISTANCE}px 0px`,
    });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [checkNearEnd, setNearEnd]);

  return { list, end, ...pagination, onScroll: () => setNearEnd(checkNearEnd()) };
}
