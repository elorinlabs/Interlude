export const SETTING_DRAG_THRESHOLD = 6;
const SETTING_COLORS = ['#286fbd', '#237f91', '#3c815b', '#a36b24', '#bd5a2f', '#c44b35'];

/** Keep white text readable while moving from cool to warm as the setting increases. */
export function settingSegmentColor(index: number, count: number) {
  const position = count > 1 ? Math.max(0, Math.min(index, count - 1)) / (count - 1) : 0;
  return SETTING_COLORS[Math.floor(position * (SETTING_COLORS.length - 1))];
}

/** A drag follows the finger across equal-width options and stops at either end. */
export function settingSegmentAt(position: number, width: number, count: number): number | null {
  if (width <= 0 || count < 1) return null;
  return Math.max(0, Math.min(count - 1, Math.floor(position / width * count)));
}

export function isSettingDrag(dx: number, dy: number) {
  return Math.abs(dx) > SETTING_DRAG_THRESHOLD && Math.abs(dx) > Math.abs(dy);
}
