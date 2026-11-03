import { useSyncExternalStore } from 'react';
import { DEFAULT_JSON_HIGHLIGHT_MB, jsonHighlightLimit } from './jsonHighlightLimit';

export const JSON_HIGHLIGHT_KEY = 'codex-switch.preview.json-highlight-mb';
const CHANGE_EVENT = 'codex-switch.preview.preferences';
let fallback = DEFAULT_JSON_HIGHLIGHT_MB;

function read() {
  try {
    const value = localStorage.getItem(JSON_HIGHLIGHT_KEY);
    return value === null ? DEFAULT_JSON_HIGHLIGHT_MB : jsonHighlightLimit(Number(value));
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

export function saveJsonHighlightLimit(value: number) {
  fallback = jsonHighlightLimit(value);
  try { localStorage.setItem(JSON_HIGHLIGHT_KEY, String(fallback)); }
  catch { /* Restricted storage keeps this preference for the current session. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useJsonHighlightLimit() {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_JSON_HIGHLIGHT_MB);
}
