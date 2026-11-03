import { useEffect, useRef, useState } from 'react';

const PREFETCH_SCREEN_PROGRESS = 0.7;

interface Options {
  enabled: boolean;
  loading: boolean;
  scope: string;
  cursor: string | null;
  loadMore: () => Promise<void>;
  retryOnScroll?: boolean;
}

/** Keep a screen ahead, then refill after 70% of that screen has been consumed. */
export function useViewportThreadPagination(options: Options) {
  const list = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const buffer = useRef({ scope: options.scope, filling: true, viewportHeight: 0 });
  const [attemptedPage, setAttemptedPage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const page = JSON.stringify([options.scope, options.cursor]);
  // Successful pages advance the cursor; an unchanged cursor pauses automatic retries.
  const failed = attemptedPage === page && !loadingMore;
  if (buffer.current.scope !== options.scope) {
    buffer.current = { scope: options.scope, filling: true, viewportHeight: 0 };
  }

  const loadMore = async (retry = false) => {
    if (!options.enabled || options.loading || pending.current || !options.cursor || (failed && !retry)) return;
    pending.current = true;
    setLoadingMore(true);
    setAttemptedPage(page);
    try { await options.loadMore(); }
    catch { /* Keep this page paused; the controller reports the request error. */ }
    finally { pending.current = false; setLoadingMore(false); }
  };

  const check = (retry = false) => {
    const node = list.current;
    if (!node || node.clientHeight <= 0 || node.scrollHeight <= 0) return;
    if (buffer.current.viewportHeight !== node.clientHeight) {
      buffer.current.viewportHeight = node.clientHeight;
      buffer.current.filling = true;
    }
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (remaining >= node.clientHeight) buffer.current.filling = false;
    if (remaining <= node.clientHeight * (1 - PREFETCH_SCREEN_PROGRESS)) buffer.current.filling = true;
    if (buffer.current.filling) void loadMore(retry);
  };
  const latest = useRef({ check, retryOnScroll: options.retryOnScroll });
  latest.current = { check, retryOnScroll: options.retryOnScroll };

  // React has committed the appended rows before measuring how much buffer is left.
  useEffect(() => { check(); });

  useEffect(() => {
    const node = list.current;
    if (!node) return;
    let previousTop = node.scrollTop;
    const onScroll = () => {
      const down = node.scrollTop > previousTop;
      previousTop = node.scrollTop;
      latest.current.check(down && latest.current.retryOnScroll);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) latest.current.check(latest.current.retryOnScroll);
    };
    const observer = new ResizeObserver(() => latest.current.check());
    observer.observe(node);
    node.addEventListener('scroll', onScroll, { passive: true });
    node.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', onScroll);
      node.removeEventListener('wheel', onWheel);
    };
  }, []);

  return { list, loadingMore, failed, retry: () => { void loadMore(true); } };
}
