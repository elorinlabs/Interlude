import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { DesktopPointer } from './input';
import type { DesktopViewport, Size } from './geometry';
import { mouseViewportKey, type MouseViewportBehavior } from './mouseViewport';

/** Share the translated video rectangle with drawing, local cursor placement and input mapping. */
export function useMouseViewport(pointer: DesktopPointer, base: DesktopViewport, panel?: Size,
  behavior: MouseViewportBehavior = {}): DesktopViewport {
  const options = { base, panel, ...behavior };
  const key = mouseViewportKey(options);
  useSyncExternalStore(pointer.subscribe, pointer.viewport.getSnapshot);
  useLayoutEffect(() => { pointer.viewport.configure(options); }, [pointer, key]);
  useLayoutEffect(() => () => pointer.viewport.clear(), [pointer]);
  return pointer.viewport.preview(options);
}
