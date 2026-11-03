import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { adjacentPage, pageSwipeOffset, pageTrackOffset, type PrimaryPage, type SwipeDirection } from './pageSwipe';

export interface PageAnimation {
  setOffset: (offset: number) => void;
  animate: (offset: number, complete: () => void) => void;
  stop: () => void;
}

interface Options {
  page: string; width: number; onChange: (page: PrimaryPage) => void; animation: PageAnimation;
}
export interface PagePreview { page: PrimaryPage; direction: SwipeDirection }

/** Keep the selected tab unchanged until the incoming page has finished settling. */
export function usePageTransition({ page, width, onChange, animation }: Options) {
  const [state, setState] = useState<{ preview: PagePreview | null }>({ preview: null });
  const current = useRef<PagePreview | null>(null);
  const settling = useRef(false);
  const revision = useRef(0);
  const change = useRef(onChange);
  change.current = onChange;
  const origin = pageTrackOffset(page, width);
  useLayoutEffect(() => {
    revision.current++;
    animation.stop();
    animation.setOffset(origin);
    current.current = null;
    settling.current = false;
    // Publish even an empty preview: RN's native setValue does not render the new value.
    // The next render must synchronize Animated.View after a tab press, resize or subpage return.
    setState({ preview: null });
    return () => { revision.current++; animation.stop(); };
  }, [page, width, origin, animation]);

  const onMove = useCallback((dx: number, direction: SwipeDirection) => {
    if (settling.current || width <= 0) return;
    const destination = adjacentPage(page, direction);
    if (!destination) return;
    if (!current.current) {
      current.current = { page: destination, direction };
      setState({ preview: current.current });
    }
    animation.setOffset(origin + pageSwipeOffset(dx, current.current.direction, width));
  }, [page, width, origin, animation]);

  const settle = useCallback((destination?: PrimaryPage) => {
    if (!current.current || settling.current) return;
    settling.current = true;
    const version = revision.current;
    const offset = destination ? pageTrackOffset(destination, width) : origin;
    animation.animate(offset, () => {
      if (revision.current !== version) return;
      // Keep the incoming pane and final native offset until React commits the selected page.
      // Rebasing either one here can briefly reveal the outgoing page on Android.
      if (destination) { change.current(destination); return; }
      current.current = null;
      settling.current = false;
      setState({ preview: null });
    });
  }, [animation, width, origin]);
  const onEnd = useCallback((direction?: SwipeDirection) => {
    if (!direction) settle();
  }, [settle]);
  const navigate = useCallback((destination: PrimaryPage) => {
    if (current.current?.page === destination) settle(destination);
  }, [settle]);
  const progress = useMemo(() => ({ onMove, onEnd }), [onMove, onEnd]);
  return { preview: state.preview, progress, navigate };
}
