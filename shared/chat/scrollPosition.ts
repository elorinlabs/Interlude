const SCROLL_BOTTOM_VISIBLE_RATIO = 0.5;
const HISTORY_PREFETCH_VIEWPORT_RATIO = 0.5;
const MIN_HISTORY_PREFETCH_DISTANCE = 100;
const FOLLOW_SCROLL_DISTANCE = 100;

interface ScrollPosition {
  contentHeight: number;
  viewportHeight: number;
  offset: number;
}

/** Only a reader's downward movement may resume following; restored anchors must stay paused. */
export function shouldFollowScroll({ contentHeight, viewportHeight, offset, movement }:
  ScrollPosition & { movement: number }): boolean {
  return movement > 0 && contentHeight - viewportHeight - offset < FOLLOW_SCROLL_DISTANCE;
}

/** Show the shortcut only when more than half a viewport remains below the visible content. */
export function shouldShowScrollToBottom({ contentHeight, viewportHeight, offset }: ScrollPosition): boolean {
  return viewportHeight > 0 && contentHeight - viewportHeight - Math.max(0, offset)
    > viewportHeight * SCROLL_BOTTOM_VISIBLE_RATIO;
}

/** Fetch before the reader reaches the first loaded message, adapting to the available reading area. */
export function isNearHistoryStart({ viewportHeight, offset }: Pick<ScrollPosition, 'viewportHeight' | 'offset'>) {
  return viewportHeight > 0
    && offset <= Math.max(MIN_HISTORY_PREFETCH_DISTANCE, viewportHeight * HISTORY_PREFETCH_VIEWPORT_RATIO);
}
