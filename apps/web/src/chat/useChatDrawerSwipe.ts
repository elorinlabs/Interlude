import { useCallback, useRef } from 'react';
import { usePageSwipe } from '../../../../shared/navigation/PageSwipeContext';
import type { SwipeDirection } from '../../../../shared/navigation/pageSwipe';
import { swipeSurface } from '../navigation/swipeSurface';
import { useHorizontalSwipe } from '../navigation/useHorizontalSwipe';
import { useDrawerMotion } from './useDrawerMotion';

interface Options {
  enabled: boolean; open: boolean; onOpenChange: (open: boolean) => void; onNext?: () => void;
}

export function useChatDrawerSwipe({ enabled, open, onOpenChange, onNext }: Options) {
  const swipe = usePageSwipe();
  const { motion, view } = useDrawerMotion({ open, onOpenChange });
  const direction = useRef<SwipeDirection | undefined>(undefined);
  const exposed = useRef(view.visible);
  const drawerGesture = useRef(false);
  exposed.current = view.visible;
  const surface = useCallback((target: EventTarget | null) => swipeSurface(target,
    exposed.current ? '.chat-drawer' : '.chat-page:not([hidden]) .chat-message-region', exposed.current), []);
  const onMove = useCallback((dx: number, next: SwipeDirection) => {
    if (!direction.current) drawerGesture.current = exposed.current || next === 'right';
    direction.current = next;
    if (drawerGesture.current) motion.move(dx);
    else swipe?.onMove?.(dx, next);
  }, [motion, swipe]);
  const onEnd = useCallback((completed?: SwipeDirection) => {
    if (drawerGesture.current) {
      if (!completed) motion.cancel();
    } else swipe?.onEnd?.(completed);
    direction.current = undefined;
  }, [motion, swipe]);
  const onLeft = useCallback(() => {
    if (drawerGesture.current) motion.close();
    else (swipe?.onNext ?? onNext)?.();
  }, [motion, swipe, onNext]);
  useHorizontalSwipe({ enabled, surface, onRight: open ? undefined : motion.open,
    onLeft, onMove, onEnd });
  return { ...view, openDrawer: motion.open, closeDrawer: motion.close };
}
