import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { shouldDismissSheet } from '../../../../shared/sheets/dragDismiss';

const CLAIM_DISTANCE = 6;
const VELOCITY_WINDOW_MS = 100;

interface Point { x: number; y: number; time: number }
interface Drag { start: Point; last: Point; velocityY: number; claimed: boolean }

function canDragFrom(target: EventTarget | null, surface: HTMLElement) {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return false;
  for (let node: Element | null = target; node && node !== surface; node = node.parentElement) {
    if (node instanceof HTMLElement && node.scrollTop > 0 && /auto|scroll/.test(getComputedStyle(node).overflowY)) {
      return false;
    }
  }
  return true;
}

export function useSheetDrag(onClose: () => void, enabled = true) {
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  useEffect(() => {
    if (!surface || !enabled) return;
    let drag: Drag | null = null;
    let suppressClick = false;
    const reset = () => { drag = null; setOffset(0); setDragging(false); };
    const start = (target: EventTarget | null, point: Point) => {
      suppressClick = false;
      if (!canDragFrom(target, surface)) return reset();
      drag = { start: point, last: point, velocityY: 0, claimed: false };
    };
    const move = (event: Event, point: Point) => {
      if (!drag) return;
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      if (!drag.claimed && Math.max(Math.abs(dx), Math.abs(dy)) < CLAIM_DISTANCE) return;
      if (!drag.claimed && (dy <= Math.abs(dx) || !event.cancelable)) return reset();
      event.preventDefault();
      drag.claimed = true;
      suppressClick = true;
      const elapsed = point.time - drag.last.time;
      if (elapsed > 0) drag.velocityY = (point.y - drag.last.y) / elapsed;
      drag.last = point;
      setDragging(true);
      setOffset(Math.max(0, dy));
    };
    const finish = (event: Event, point: Point) => {
      const current = drag;
      reset();
      if (!current?.claimed) return;
      if (event.cancelable) event.preventDefault();
      const velocityY = point.time - current.last.time <= VELOCITY_WINDOW_MS ? current.velocityY : 0;
      if (shouldDismissSheet({ dx: point.x - current.start.x, dy: point.y - current.start.y, velocityY })) {
        latestClose.current();
      }
    };
    const touchPoint = (event: TouchEvent): Point => ({
      x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY, time: event.timeStamp,
    });
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return reset();
      start(event.target, touchPoint(event));
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return reset();
      move(event, touchPoint(event));
    };
    const touchEnd = (event: TouchEvent) => finish(event, touchPoint(event));
    const mousePoint = (event: MouseEvent): Point => ({ x: event.clientX, y: event.clientY, time: event.timeStamp });
    const mouseStart = (event: MouseEvent) => { if (event.button === 0) start(event.target, mousePoint(event)); };
    const mouseMove = (event: MouseEvent) => move(event, mousePoint(event));
    const mouseEnd = (event: MouseEvent) => finish(event, mousePoint(event));
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      event.preventDefault(); event.stopPropagation(); suppressClick = false;
    };
    // A non-passive listener can take over a downward pull at the top without disabling native scrolling.
    surface.addEventListener('touchstart', touchStart, { passive: true });
    surface.addEventListener('touchmove', touchMove, { passive: false });
    surface.addEventListener('touchend', touchEnd, { passive: false });
    surface.addEventListener('touchcancel', reset);
    surface.addEventListener('mousedown', mouseStart);
    surface.addEventListener('click', click, true);
    window.addEventListener('mousemove', mouseMove);
    window.addEventListener('mouseup', mouseEnd);
    return () => {
      reset();
      surface.removeEventListener('touchstart', touchStart);
      surface.removeEventListener('touchmove', touchMove);
      surface.removeEventListener('touchend', touchEnd);
      surface.removeEventListener('touchcancel', reset);
      surface.removeEventListener('mousedown', mouseStart);
      surface.removeEventListener('click', click, true);
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mouseup', mouseEnd);
    };
  }, [surface, enabled]);
  const style: CSSProperties = {
    // Popup's spring consumes transform props, so keep the live offset in a CSS variable.
    ['--sheet-drag-offset' as string]: `${offset}px`,
    transition: dragging ? 'none' : 'translate 180ms ease-out',
  };
  return { style, ref: setSurface };
}
