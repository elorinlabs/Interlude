const REFRESH_INTERVAL_KEY = 'codex-switch.web.refresh-minutes.v1';
export const REFRESH_INTERVAL_EVENT = 'codex-switch:refresh-interval';
export const MIN_REFRESH_MINUTES = 1;
export const MAX_REFRESH_MINUTES = 1440;

export function loadRefreshMinutes() {
  const value = Number(localStorage.getItem(REFRESH_INTERVAL_KEY));
  return Number.isInteger(value) && value >= MIN_REFRESH_MINUTES && value <= MAX_REFRESH_MINUTES ? value : 30;
}

export function saveRefreshMinutes(minutes: number) {
  localStorage.setItem(REFRESH_INTERVAL_KEY, String(minutes));
  window.dispatchEvent(new Event(REFRESH_INTERVAL_EVENT));
}
