import { useSyncExternalStore, type CSSProperties } from 'react';

const GLOBAL_STORAGE_KEY = 'codex-switch:global-font-size';
const GUI_STORAGE_KEY = 'codex-switch:gui-font-size';
const CHANGE_EVENT = 'codex-switch:gui-appearance-changed';
export const DEFAULT_FONT_SIZE = 14;
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 24;

export function normalizeFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

function readSavedSize(key: string): number | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return typeof value === 'number' && Number.isFinite(value) ? normalizeFontSize(value) : null;
  } catch { return null; }
}

function readGlobalFontSize(): number {
  return readSavedSize(GLOBAL_STORAGE_KEY) ?? DEFAULT_FONT_SIZE;
}

function readGuiFontSize(): number {
  return readSavedSize(GUI_STORAGE_KEY) ?? readGlobalFontSize();
}

function followsGlobal(): boolean {
  // Existing numeric preferences remain custom; missing or invalid preferences inherit.
  return readSavedSize(GUI_STORAGE_KEY) === null;
}

function saveSize(key: string, value: number | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(normalizeFontSize(value)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch { return false; }
}

export function saveGlobalFontSize(value: number): boolean {
  return saveSize(GLOBAL_STORAGE_KEY, value);
}

export function saveGuiFontSize(value: number): boolean {
  return saveSize(GUI_STORAGE_KEY, value);
}

export function setGuiFollowGlobal(follow: boolean): boolean {
  return saveSize(GUI_STORAGE_KEY, follow ? null : readGuiFontSize());
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useGlobalFontSize(): number {
  return useSyncExternalStore(subscribe, readGlobalFontSize, () => DEFAULT_FONT_SIZE);
}

export function useGuiFontSize(): number {
  return useSyncExternalStore(subscribe, readGuiFontSize, () => DEFAULT_FONT_SIZE);
}

export function useGuiFollowGlobal(): boolean {
  return useSyncExternalStore(subscribe, followsGlobal, () => true);
}

export function guiFontStyle(fontSize: number): CSSProperties {
  return { '--gui-font-size': `${fontSize}px`, '--app-font-scale': fontSize / DEFAULT_FONT_SIZE,
    fontSize } as CSSProperties;
}
