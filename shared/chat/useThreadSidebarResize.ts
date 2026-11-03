import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";

const WIDTH_KEY = "codex-switch:gui-sidebar-width";
const WIDTH_EVENT = "codex-switch:gui-sidebar-width-changed";
const DEFAULT_WIDTH = 236;
const MIN_WIDTH = 200;
const MAX_WIDTH = 520;
const MIN_CHAT_WIDTH = 320;
const COMPACT_VIEWPORT = 1150;
const KEYBOARD_STEP = 16;

function readWidth() {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN_WIDTH ? Math.min(MAX_WIDTH, value) : null;
  } catch { return null; }
}

function rememberWidth(width: number | null) {
  try {
    if (width === null) localStorage.removeItem(WIDTH_KEY);
    else localStorage.setItem(WIDTH_KEY, String(width));
    window.dispatchEvent(new Event(WIDTH_EVENT));
  } catch { /* Resizing still works when preferences cannot be saved. */ }
}

export function useThreadSidebarResize(sidebar: RefObject<HTMLElement>, layoutSelector: string) {
  const [available, setAvailable] = useState<number | null>(null);
  const [viewport, setViewport] = useState(window.innerWidth);
  const [preferred, setPreferred] = useState(readWidth);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const drag = useRef<{ pointer: number; x: number; width: number; target: HTMLDivElement }>();
  const maximum = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, (available ?? viewport) - MIN_CHAT_WIDTH));
  const clamp = (value: number) => Math.min(maximum, Math.max(MIN_WIDTH, Math.round(value)));
  const width = clamp(dragWidth ?? preferred ?? (viewport <= COMPACT_VIEWPORT ? MIN_WIDTH : DEFAULT_WIDTH));
  const dragging = dragWidth !== null;
  const cancel = useCallback(() => {
    const current = drag.current;
    drag.current = undefined;
    setDragWidth(null);
    if (current?.target.hasPointerCapture(current.pointer)) current.target.releasePointerCapture(current.pointer);
  }, []);

  useEffect(() => {
    const layout = sidebar.current?.closest(layoutSelector);
    if (!layout) return;
    const measure = () => {
      setAvailable(layout.getBoundingClientRect().width);
      setViewport(window.innerWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layout);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [sidebar, layoutSelector]);

  useEffect(() => {
    const sync = () => setPreferred(readWidth());
    window.addEventListener(WIDTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(WIDTH_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("blur", cancel);
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
      window.removeEventListener("blur", cancel);
    };
  }, [dragging, cancel]);

  useEffect(() => { if (available === 0) cancel(); }, [available, cancel]);

  const commit = (value: number | null) => { setPreferred(value); rememberWidth(value); };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const values: Record<string, number> = { ArrowLeft: width - KEYBOARD_STEP, ArrowRight: width + KEYBOARD_STEP,
      Home: MIN_WIDTH, End: maximum };
    if (!(event.key in values)) return;
    event.preventDefault();
    commit(clamp(values[event.key]));
  };
  return { width, minimum: MIN_WIDTH, maximum, dragging, enabled: available !== null && available > 0, handle: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      drag.current = { pointer: event.pointerId, x: event.clientX, width, target: event.currentTarget };
      setDragWidth(width);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (drag.current?.pointer === event.pointerId) {
        setDragWidth(clamp(drag.current.width + event.clientX - drag.current.x));
      }
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (drag.current?.pointer !== event.pointerId) return;
      commit(clamp(drag.current.width + event.clientX - drag.current.x));
      cancel();
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onKeyDown: keyboard,
    onDoubleClick: () => { cancel(); commit(null); },
  } };
}
