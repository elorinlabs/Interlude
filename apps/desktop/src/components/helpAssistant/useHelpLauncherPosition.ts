import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { DashboardPage } from '../dashboard/DashboardNavigation';
import { clampPosition, readLauncherPosition, saveLauncherPosition, type LauncherPosition } from './launcherPosition';

const DRAG_THRESHOLD = 4;
interface DragState {
  pointerId: number;
  page: DashboardPage;
  start: LauncherPosition;
  origin: LauncherPosition;
  position: LauncherPosition;
  moved: boolean;
}

export function useHelpLauncherPosition(page: DashboardPage) {
  const [position, setPosition] = useState(() => readLauncherPosition(page));
  const [dragging, setDragging] = useState(false);
  const drag = useRef<DragState>();
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    drag.current = undefined;
    suppressClick.current = false;
    setDragging(false);
    const saved = readLauncherPosition(page);
    setPosition(saved && clampPosition(saved));
  }, [page]);

  useLayoutEffect(() => {
    const resize = () => setPosition((current) => current && clampPosition(current));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !event.isPrimary) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const origin = { x: bounds.x, y: bounds.y };
    suppressClick.current = false;
    drag.current = { pointerId: event.pointerId, page, origin, position: origin, moved: false,
      start: { x: event.clientX, y: event.clientY } };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.start.x;
    const dy = event.clientY - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    current.moved = true;
    current.position = clampPosition({ x: current.origin.x + dx, y: current.origin.y + dy });
    suppressClick.current = true;
    setDragging(true);
    setPosition(current.position);
    event.preventDefault();
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = undefined;
    setDragging(false);
    if (current.moved) saveLauncherPosition(current.page, current.position);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const consumeDragClick = () => {
    const consumed = suppressClick.current;
    suppressClick.current = false;
    return consumed;
  };
  const style: CSSProperties | undefined = position
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined;
  return { position, style, dragging, consumeDragClick, handlers: {
    onPointerDown, onPointerMove, onPointerUp: finishDrag,
    onPointerCancel: finishDrag, onLostPointerCapture: finishDrag,
  } };
}
