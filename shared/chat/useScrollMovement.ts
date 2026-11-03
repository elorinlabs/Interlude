import { useCallback, useMemo, useRef } from 'react';

type Viewport = Pick<HTMLElement, 'scrollTop' | 'clientWidth' | 'clientHeight'>;
export interface ScrollMovement {
  remember: (node: Viewport | null) => void;
  read: (node: Viewport) => number;
}

/** Share the last applied position so layout corrections cannot masquerade as reader scrolling. */
export function useScrollMovement(): ScrollMovement {
  const position = useRef({ offset: 0, width: 0, height: 0 });
  const remember = useCallback((node: Viewport | null) => {
    position.current = { offset: node?.scrollTop ?? 0,
      width: node?.clientWidth ?? 0, height: node?.clientHeight ?? 0 };
  }, []);
  const read = useCallback((node: Viewport) => {
    const previous = position.current;
    remember(node);
    const current = position.current;
    // Resizing can clamp scrollTop before ResizeObserver runs, including after maximizing a window.
    if (previous.width !== current.width || previous.height !== current.height) return 0;
    return current.offset - previous.offset;
  }, [remember]);
  return useMemo(() => ({ remember, read }), [remember, read]);
}
