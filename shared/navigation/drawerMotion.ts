import type { PageAnimation } from './usePageTransition';

const DRAWER_WIDTH_RATIO = 0.88;
const MAX_DRAWER_WIDTH = 360;

export const chatDrawerWidth = (viewportWidth: number) => Math.min(viewportWidth * DRAWER_WIDTH_RATIO, MAX_DRAWER_WIDTH);

interface Options {
  width: number;
  initiallyOpen: boolean;
  animation: PageAnimation;
  onStart: () => void;
  onSettled: (open: boolean) => void;
}

/** Keep the committed state until settling finishes, including cancelled drags. */
export function createDrawerMotion({ width, initiallyOpen, animation, onStart, onSettled }: Options) {
  let open = initiallyOpen;
  let moving = false;
  let destination: boolean | undefined;
  let revision = 0;
  const start = () => {
    if (moving) return;
    moving = true;
    animation.stop();
    onStart();
  };
  const settle = (next: boolean) => {
    if (destination === next) return;
    if (!moving && next === open) { onSettled(open); return; }
    start();
    animation.stop();
    destination = next;
    const version = ++revision;
    animation.animate(next ? width : 0, () => {
      if (revision !== version) return;
      open = next;
      moving = false;
      destination = undefined;
      onSettled(open);
    });
  };
  return {
    move: (dx: number) => {
      if (destination !== undefined) return;
      start();
      animation.setOffset(Math.max(0, Math.min(width, (open ? width : 0) + dx)));
    },
    open: () => settle(true),
    close: () => settle(false),
    cancel: () => { if (moving && destination === undefined) settle(open); },
    dispose: () => { revision++; animation.stop(); },
  };
}
