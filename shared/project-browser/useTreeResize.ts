import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

const DEFAULT_WIDTH = 220;
const MIN_TREE_WIDTH = 140;
const MIN_EDITOR_WIDTH = 220;
const STORAGE_KEY = 'codex-switch:project-file-tree-width';
const SINGLE_PANE_WIDTH = 600;
function preferredWidth() {
  try { return Number(localStorage.getItem(STORAGE_KEY)) || DEFAULT_WIDTH; }
  catch { return DEFAULT_WIDTH; }
}

export function useTreeResize(host: RefObject<HTMLDivElement>) {
  const [available, setAvailable] = useState(800);
  const [preferred, setPreferred] = useState(preferredWidth);
  const drag = useRef<{ x: number; width: number; pointer: number }>();
  const maximum = Math.max(MIN_TREE_WIDTH, available - MIN_EDITOR_WIDTH);
  const clamp = (value: number) => Math.round(Math.max(MIN_TREE_WIDTH, Math.min(maximum, value)));
  const width = clamp(preferred);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [host]);
  const remember = (value: number) => {
    setPreferred(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); }
    catch { /* The split remains adjustable without preference storage. */ }
  };
  return { width, narrow: available <= SINGLE_PANE_WIDTH, minimum: MIN_TREE_WIDTH, maximum, handle: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width, pointer: event.pointerId };
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (drag.current?.pointer === event.pointerId) {
        setPreferred(clamp(drag.current.width + event.clientX - drag.current.x));
      }
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (drag.current?.pointer !== event.pointerId) return;
      remember(clamp(drag.current.width + event.clientX - drag.current.x)); drag.current = undefined;
    },
    onLostPointerCapture: () => { drag.current = undefined; },
    onPointerCancel: () => { drag.current = undefined; },
    onDoubleClick: () => remember(DEFAULT_WIDTH),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      const sizes: Record<string, number> = {
        ArrowLeft: width - 20, ArrowRight: width + 20, Home: MIN_TREE_WIDTH, End: maximum,
      };
      if (!(event.key in sizes)) return;
      event.preventDefault(); remember(clamp(sizes[event.key]));
    },
  } };
}
