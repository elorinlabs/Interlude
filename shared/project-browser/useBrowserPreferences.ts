import { useSyncExternalStore } from 'react';
import { AUTO_SAVE_KEY, autoSaveDelay, DEFAULT_AUTO_SAVE_DELAY } from './preferences';

const CHANGE_EVENT = 'project-browser-preferences';
let fallback = DEFAULT_AUTO_SAVE_DELAY;

function read() {
  try {
    const value = localStorage.getItem(AUTO_SAVE_KEY);
    return value === null ? DEFAULT_AUTO_SAVE_DELAY : autoSaveDelay(Number(value));
  } catch { return fallback; }
}
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}
function change(value: number) {
  fallback = autoSaveDelay(value);
  try { localStorage.setItem(AUTO_SAVE_KEY, String(fallback)); }
  catch { /* Restricted storage still allows the preference for this session. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function useBrowserPreferences() {
  return { delay: useSyncExternalStore(subscribe, read), change };
}
