import { useCallback, useEffect, useState } from 'react';

export const accountThemes = {
  original: { accent: '#315f74', ink: '#233b49' },
  navy: { accent: '#304d73', ink: '#24354b' },
  sand: { accent: '#765b40', ink: '#3f352c' },
  sage: { accent: '#3f6659', ink: '#293e35' },
} as const;
export type AccountTheme = keyof typeof accountThemes;
const storageKey = 'interlude:account-theme';
const eventName = 'interlude:account-theme-changed';

function readTheme(): AccountTheme {
  try {
    const value = localStorage.getItem(storageKey);
    return value && Object.hasOwn(accountThemes, value) ? value as AccountTheme : 'original';
  } catch { return 'original'; }
}

export function useAccountTheme() {
  const [theme, updateTheme] = useState<AccountTheme>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.accountTheme = theme;
  }, [theme]);
  useEffect(() => {
    const sync = (event: Event) => updateTheme(event instanceof CustomEvent ? event.detail : readTheme());
    window.addEventListener('storage', sync);
    window.addEventListener(eventName, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(eventName, sync);
    };
  }, []);
  const setTheme = useCallback((value: AccountTheme) => {
    updateTheme(value);
    try { localStorage.setItem(storageKey, value); }
    catch { /* The preference still works for this window. */ }
    window.dispatchEvent(new CustomEvent(eventName, { detail: value }));
  }, []);
  return { theme, setTheme, colors: accountThemes[theme] };
}
