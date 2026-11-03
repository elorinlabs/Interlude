const DISMISS_DISTANCE = 80;
const FLICK_DISTANCE = 12;
const FLICK_VELOCITY = 0.9;

/** Distances are layout units; velocity is layout units per millisecond. */
export function shouldDismissSheet({ dx, dy, velocityY }: { dx: number; dy: number; velocityY: number }) {
  if (dy <= Math.abs(dx)) return false;
  return dy >= DISMISS_DISTANCE || (dy > FLICK_DISTANCE && velocityY >= FLICK_VELOCITY);
}
