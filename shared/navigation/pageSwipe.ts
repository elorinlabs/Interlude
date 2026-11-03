export const PRIMARY_PAGES = ['chat', 'accounts', 'discover', 'settings'] as const;
export type PrimaryPage = typeof PRIMARY_PAGES[number];
export type SwipeDirection = 'left' | 'right';

export const SWIPE_START_DISTANCE = 12;
export const SWIPE_COMPLETE_DISTANCE = 60;
export const SWIPE_DIRECTION_RATIO = 1.5;
export const SWIPE_LONG_PRESS_MS = 500;
export const SWIPE_SETTLE_MS = 220;

export interface SwipeProgress {
  onMove?: (dx: number, direction: SwipeDirection) => void;
  onEnd?: (direction?: SwipeDirection) => void;
}

/** Absolute track position; panes keep the same slot before and after a swipe commits. */
export function pageTrackOffset(page: string, width: number) {
  return 0 - Math.max(0, PRIMARY_PAGES.findIndex(item => item === page)) * width;
}

export function pageSwipeOffset(dx: number, direction: SwipeDirection, width: number) {
  return direction === 'left' ? Math.max(-width, Math.min(0, dx)) : Math.min(width, Math.max(0, dx));
}

export function adjacentPage(page: string, direction: SwipeDirection): PrimaryPage | undefined {
  const index = PRIMARY_PAGES.findIndex(item => item === page);
  if (index < 0) return undefined;
  return PRIMARY_PAGES[index + (direction === 'left' ? 1 : -1)];
}

export function horizontalDirection(dx: number, dy: number, distance = SWIPE_START_DISTANCE) {
  if (Math.abs(dx) < distance || Math.abs(dx) <= Math.abs(dy) * SWIPE_DIRECTION_RATIO) return undefined;
  return dx < 0 ? 'left' : 'right';
}

export function verticalSwipe(dx: number, dy: number) {
  return Math.abs(dy) > SWIPE_START_DISTANCE && Math.abs(dy) >= Math.abs(dx);
}
