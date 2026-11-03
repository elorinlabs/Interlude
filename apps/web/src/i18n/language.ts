import { isAppLanguage, localeForLanguage, type AppLanguage } from '@interlude/i18n';
import { useSyncExternalStore } from 'react';
import {
  getInterfaceLanguage, initializeInterfaceLanguage, setInterfaceLanguage, subscribeInterfaceLanguage,
} from "../../../../shared/localization/interfaceLanguage";
import { DEFAULT_LANGUAGE, deviceLanguage } from "../../../../shared/localization/language";

export type Language = AppLanguage<'web'>;
export const LANGUAGE_KEY = 'codex-switch.web.language.v1';
const listeners = new Set<() => void>();

function readLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (isAppLanguage('web', stored)) return stored;
  } catch { /* Language switching still works without browser storage. */ }
  return deviceLanguage();
}

let language = initializeInterfaceLanguage(readLanguage());
export const getLanguage = () => language;
export const getLocale = () => localeForLanguage(language);

function publishLanguage(next: Language) {
  if (next === language) return;
  language = next;
  setInterfaceLanguage(next);
  listeners.forEach(listener => listener());
}

// Desktop embeds these chat views; follow its selection without writing Web preferences.
subscribeInterfaceLanguage(() => publishLanguage(getInterfaceLanguage()));

export function setLanguage(next: Language) {
  if (!isAppLanguage('web', next)) return;
  try { localStorage.setItem(LANGUAGE_KEY, next); }
  catch { /* Keep the selected language for this visit if storage is unavailable. */ }
  publishLanguage(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === LANGUAGE_KEY || event.key === null) publishLanguage(readLanguage());
  });
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, () => DEFAULT_LANGUAGE);
}
