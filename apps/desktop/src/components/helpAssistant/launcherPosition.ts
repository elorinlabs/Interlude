import type { DashboardPage } from '../dashboard/DashboardNavigation';

export interface LauncherPosition { x: number; y: number }
export const LAUNCHER_SIZE = 33;
export const VIEWPORT_MARGIN = 8;
export const PANEL_GAP = 14;
const STORAGE_PREFIX = 'codex-switch:help-assistant-position:';

export function clampPosition(position: LauncherPosition): LauncherPosition {
  return {
    x: Math.max(VIEWPORT_MARGIN, Math.min(position.x, window.innerWidth - LAUNCHER_SIZE - VIEWPORT_MARGIN)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(position.y, window.innerHeight - LAUNCHER_SIZE - VIEWPORT_MARGIN)),
  };
}

export function readLauncherPosition(page: DashboardPage): LauncherPosition | undefined {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_PREFIX + page) ?? 'null');
    if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)) return;
    if (typeof value.x !== 'number' || typeof value.y !== 'number') return;
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
    return { x: value.x, y: value.y };
  } catch {
    // A missing or unavailable preference keeps the default corner position.
    return undefined;
  }
}

export function saveLauncherPosition(page: DashboardPage, position: LauncherPosition) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + page, JSON.stringify(position));
  } catch {
    // Keep dragging usable for this session when browser storage is unavailable.
  }
}
