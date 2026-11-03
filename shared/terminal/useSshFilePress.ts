import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

function showContextMenu(target: HTMLElement, point: { x: number; y: number }) {
  target.dispatchEvent(new window.MouseEvent('contextmenu', {
    bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 2,
  }));
}

/** Keep a held touch from activating the entry when the finger is released. */
export function useSshFilePress(disabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number; pointerId: number }>();
  const suppressClick = useRef(false);
  const cancel = () => { clearTimeout(timer.current); timer.current = undefined; start.current = undefined; };
  useEffect(() => { if (disabled) cancel(); return cancel; }, [disabled]);
  const onPointerDown = (event: PointerEvent<HTMLUListElement>) => {
    cancel(); suppressClick.current = false;
    if (disabled || event.button !== 0 || !event.isPrimary) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-ssh-path]') : null;
    if (!target) return;
    const point = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    start.current = point;
    timer.current = setTimeout(() => {
      suppressClick.current = true; cancel(); showContextMenu(target, point);
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (event: PointerEvent<HTMLUListElement>) => {
    const point = start.current;
    if (!point || point.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - point.x, event.clientY - point.y) > MOVE_TOLERANCE_PX) cancel();
  };
  const onClickCapture = (event: MouseEvent<HTMLUListElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false; event.preventDefault(); event.stopPropagation();
  };
  return { isLongPress: () => suppressClick.current,
    events: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel, onScroll: cancel,
      onClickCapture, onKeyDownCapture: () => { suppressClick.current = false; } } };
}

export function showSshKeyboardMenu(target: HTMLElement) {
  const bounds = target.getBoundingClientRect();
  showContextMenu(target, { x: bounds.left + bounds.width / 2, y: bounds.bottom });
}
