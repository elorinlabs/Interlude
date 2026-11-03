import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

/** Scrolling cancels the press; releasing a completed long press must not open the folder. */
export function useTreeGesture(open: (position: { x: number; y: number }) => void) {
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number }>();
  const suppressed = useRef(false);
  const cancel = () => { if (pending.current) clearTimeout(pending.current.timer); pending.current = undefined; };
  useEffect(() => cancel, []);
  return {
    onPointerDown: (event: PointerEvent) => {
      cancel(); suppressed.current = false;
      if (event.pointerType !== 'touch') return;
      const x = event.clientX, y = event.clientY;
      pending.current = { x, y, timer: setTimeout(() => {
        pending.current = undefined; suppressed.current = true; open({ x, y });
      }, LONG_PRESS_MS) };
    },
    onPointerMove: (event: PointerEvent) => {
      const point = pending.current;
      if (point && Math.hypot(point.x - event.clientX, point.y - event.clientY) > MOVE_TOLERANCE) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault(); cancel(); suppressed.current = true; open({ x: event.clientX, y: event.clientY });
    },
    onClickCapture: (event: MouseEvent) => {
      if (suppressed.current) { event.preventDefault(); event.stopPropagation(); suppressed.current = false; }
    },
  };
}
