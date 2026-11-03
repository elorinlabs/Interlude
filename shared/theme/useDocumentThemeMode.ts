import { useSyncExternalStore } from 'react';
import type { ThemeMode } from './mode';

function readTheme(): ThemeMode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

// Embedded browser components must follow the host's applied theme, including GUI overrides.
export function useDocumentThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, readTheme, () => 'light');
}
