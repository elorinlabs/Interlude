import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

const WIDTH_KEY = "codex-switch:gui-details-width";
export const DEFAULT_DRAWER_WIDTH = 560;
const MIN_DRAWER_WIDTH = 300;
const EDGE_GAP = 24;
const KEYBOARD_STEP = 24;

function initialWidth(key: string) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value >= MIN_DRAWER_WIDTH ? value : null;
  } catch { return null; }
}
function rememberWidth(key: string, width: number | null) {
  try { if (width === null) localStorage.removeItem(key); else localStorage.setItem(key, String(width)); }
  catch { /* Resizing remains available when preferences cannot be saved. */ }
}

export function drawerBounds(available: number) {
  const maximum = Math.max(1, available - EDGE_GAP);
  return { minimum: Math.min(MIN_DRAWER_WIDTH, maximum), maximum };
}

export function useDrawerResize(host: RefObject<HTMLDivElement>, {
  storageKey = WIDTH_KEY, defaultWidth = DEFAULT_DRAWER_WIDTH, defaultRatio = 1,
}: { storageKey?: string; defaultWidth?: number; defaultRatio?: number } = {}) {
  const [available, setAvailable] = useState(window.innerWidth);
  const [viewport, setViewport] = useState(window.innerWidth);
  const [preferred, setPreferred] = useState(() => initialWidth(storageKey));
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointer: number; x: number; width: number }>();
  const { minimum, maximum } = drawerBounds(available);
  const clamp = (value: number) => Math.min(maximum, Math.max(minimum, Math.round(value)));
  const width = clamp(preferred ?? Math.min(defaultWidth, viewport * defaultRatio));
  const cancel = useCallback(() => { drag.current = undefined; setDragging(false); }, []);
  useEffect(() => {
    if (!host.current) return;
    setAvailable(host.current.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [host]);
  useEffect(() => {
    const update = () => setViewport(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => { document.body.style.cursor = cursor; document.body.style.userSelect = userSelect; };
  }, [dragging]);
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    const next = clamp(drag.current.width + drag.current.x - event.clientX);
    setPreferred(next); rememberWidth(storageKey, next); cancel();
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const values: Record<string, number> = { ArrowLeft: width + KEYBOARD_STEP, ArrowRight: width - KEYBOARD_STEP,
      Home: minimum, End: maximum };
    if (!(event.key in values)) return;
    event.preventDefault();
    const next = clamp(values[event.key]);
    setPreferred(next); rememberWidth(storageKey, next);
  };
  return { width, available, minimum, maximum, dragging, cancel, handle: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, x: event.clientX, width };
      setDragging(true);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (drag.current?.pointer === event.pointerId) {
        setPreferred(clamp(drag.current.width + drag.current.x - event.clientX));
      }
    },
    onPointerUp: finish,
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onKeyDown: keyboard,
    onDoubleClick: () => { setPreferred(null); rememberWidth(storageKey, null); },
  } };
}
