import { useEffect, useRef } from 'react';
import type { HistoryLoadResult } from '../remote-chat/client/historyLoad';

interface Options {
  threadId?: string;
  loading: boolean;
  hasMore?: boolean;
  result?: HistoryLoadResult;
  nearTop: () => boolean;
  loadOlder: () => void;
}

/** Continue a reader-initiated load when collapsed records leave the viewport near the history edge. */
export function useHistoryContinuation(options: Options) {
  const { threadId, loading, hasMore, result } = options;
  const current = useRef(options);
  current.current = options;
  const armed = useRef(false);
  const handled = useRef<HistoryLoadResult | undefined>(undefined);
  useEffect(() => { armed.current = false; handled.current = undefined; }, [threadId]);
  useEffect(() => {
    if (!armed.current || loading || !hasMore || !result || result.threadId !== threadId
      || result === handled.current) return;
    handled.current = result;
    // A failed request has no result; an empty page must wait for an explicit retry.
    if (result.count <= 0) return;
    // Let both platforms apply the prepended rows and preserve the visible message before measuring.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const latest = current.current;
        if (latest.threadId === threadId && !latest.loading && latest.hasMore && latest.nearTop()) latest.loadOlder();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [threadId, loading, hasMore, result]);
  return () => { armed.current = true; handled.current = result; };
}
