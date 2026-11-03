import { useEffect, useRef, type UIEvent } from 'react';
import { DIFF_LOAD_THRESHOLD, useDiffPagination } from './useDiffPagination';

/** Observe inside the code scroller so both nested and full-height diff views can grow. */
export function useDiffAutoLoad(total: number, pageLines?: number) {
  const { limit, loadMore } = useDiffPagination(total, pageLines);
  const endRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const end = endRef.current;
    if (!end || limit >= total) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) loadMore();
    }, { rootMargin: `0px 0px ${DIFF_LOAD_THRESHOLD}px 0px` });
    observer.observe(end);
    return () => observer.disconnect();
  }, [limit, total, loadMore]);
  const onScroll = (event: UIEvent<HTMLElement>) => {
    const node = event.currentTarget;
    if (node.scrollHeight > node.clientHeight
      && node.scrollHeight - node.scrollTop - node.clientHeight <= DIFF_LOAD_THRESHOLD) loadMore();
  };
  return { limit, loadMore, endRef, onScroll };
}
