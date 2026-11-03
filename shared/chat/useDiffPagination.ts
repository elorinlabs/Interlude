import { useCallback, useState } from 'react';

export const DIFF_LOAD_THRESHOLD = 200;
const PAGE_LINES = 200;

/** Append one page per rendered batch, even when several scroll events arrive together. */
export function useDiffPagination(total: number, pageLines = PAGE_LINES) {
  const [limit, setLimit] = useState(pageLines);
  const loadMore = useCallback(() => {
    if (limit >= total) return;
    const nextLimit = Math.min(total, limit + pageLines);
    setLimit(current => Math.max(current, nextLimit));
  }, [limit, total, pageLines]);
  return { limit, loadMore };
}
