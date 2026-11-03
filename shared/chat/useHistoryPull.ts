import { useRef } from 'react';

const PULL_DISTANCE = 60;
export interface HistoryPullPoint { x: number; y: number }

/** Recognize one downward pull at the top without taking over the platform's scrolling. */
export function useHistoryPull(atTop: () => boolean, loadOlder: () => void) {
  const start = useRef<HistoryPullPoint | undefined>(undefined);
  const begin = (point?: HistoryPullPoint) => { start.current = atTop() ? point : undefined; };
  const clear = () => { start.current = undefined; };
  const move = (point?: HistoryPullPoint) => {
    if (!start.current) return;
    if (!point || !atTop()) { clear(); return; }
    const dx = Math.abs(point.x - start.current.x);
    const dy = point.y - start.current.y;
    if (dx > PULL_DISTANCE || dy < 0) { clear(); return; }
    if (dy < PULL_DISTANCE || dy <= dx) return;
    clear();
    loadOlder();
  };
  return { begin, move, clear };
}
