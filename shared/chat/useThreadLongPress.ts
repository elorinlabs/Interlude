import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { THREAD_LONG_PRESS_MS } from '../remote-chat/client/threadActions';

const MOVE_TOLERANCE_PX = 10;
const KEYBOARD_MENU_INSET = 16;

interface Press { target: HTMLElement; x: number; y: number }

/** Leave scrolling native and consume the click synthesized after a long press. */
export function useThreadLongPress(open: (press: Press) => void, {
  enabled = true, nativeContextMenu = false,
}: { enabled?: boolean; nativeContextMenu?: boolean } = {}) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const origin = useRef<{ x: number; y: number }>();
  const releaseClick = useRef<() => void>(() => {});
  const cancel = useCallback(() => {
    clearTimeout(timer.current); timer.current = undefined; origin.current = undefined;
    window.removeEventListener('scroll', cancel, true);
    window.removeEventListener('blur', cancel);
  }, []);
  const consumeReleaseClick = () => {
    releaseClick.current();
    const consume = (event: globalThis.MouseEvent) => {
      event.preventDefault(); event.stopImmediatePropagation(); releaseClick.current();
    };
    const clear = () => {
      document.removeEventListener('click', consume, true);
      document.removeEventListener('pointerdown', clear, true);
    };
    releaseClick.current = clear;
    // Touch release can hit the newly opened backdrop, outside the original row.
    document.addEventListener('click', consume, true);
    document.addEventListener('pointerdown', clear, true);
  };
  useEffect(() => () => { cancel(); releaseClick.current(); }, [cancel]);
  useEffect(() => { if (!enabled) { cancel(); releaseClick.current(); } }, [enabled, cancel]);
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      cancel(); releaseClick.current();
      if (!enabled || event.button !== 0 || !event.isPrimary) return;
      const press = { target: event.currentTarget, x: event.clientX, y: event.clientY };
      origin.current = press;
      window.addEventListener('scroll', cancel, true);
      window.addEventListener('blur', cancel);
      timer.current = setTimeout(() => { consumeReleaseClick(); cancel(); open(press); }, THREAD_LONG_PRESS_MS);
    },
    onPointerMove: (event: PointerEvent) => {
      if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y)
        > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel,
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (origin.current) consumeReleaseClick();
      cancel();
      if (!enabled || nativeContextMenu) return;
      event.preventDefault();
      open({ target: event.currentTarget, x: event.clientX, y: event.clientY });
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (!enabled || !(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return;
      event.preventDefault(); cancel();
      const bounds = event.currentTarget.getBoundingClientRect();
      open({ target: event.currentTarget, x: bounds.left + KEYBOARD_MENU_INSET, y: bounds.top + bounds.height / 2 });
    },
  };
}
