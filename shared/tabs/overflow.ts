export interface TabBounds { id: string; left: number; width: number }
const EDGE_TOLERANCE = 1;

/** Coordinates are relative to the scroll content, shared by DOM and native tab strips. */
export function tabOverflow(options: {
  tabs: TabBounds[]; contentWidth: number; barWidth: number; viewportWidth: number; scrollLeft: number;
}) {
  const { tabs, contentWidth, barWidth, viewportWidth, scrollLeft } = options;
  const overflowing = barWidth > 0 && contentWidth > barWidth + EDGE_TOLERANCE;
  const hiddenIds = overflowing ? tabs.filter(tab => tab.left < scrollLeft - EDGE_TOLERANCE
    || tab.left + tab.width > scrollLeft + viewportWidth + EDGE_TOLERANCE).map(tab => tab.id) : [];
  return { overflowing, hiddenIds, clippedLeft: overflowing && scrollLeft > EDGE_TOLERANCE };
}

export function revealTabOffset(tab: TabBounds, viewportWidth: number, scrollLeft: number) {
  if (tab.left < scrollLeft || tab.width > viewportWidth) return tab.left;
  if (tab.left + tab.width > scrollLeft + viewportWidth) return tab.left + tab.width - viewportWidth;
  return scrollLeft;
}
