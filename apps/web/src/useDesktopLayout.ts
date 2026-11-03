import { useEffect, useState, useSyncExternalStore } from 'react';

export const DESKTOP_QUERY = '(min-width: 861px)';
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};

export function useDesktopLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
}

export function usePanelVisibility(panel: 'main-menu' | 'chat-list') {
  const key = `codex-switch.web.${panel}.visible`;
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(key) !== 'false'; }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, String(visible)); }
    catch { /* The layout remains usable when browser storage is unavailable. */ }
  }, [key, visible]);
  return [visible, setVisible] as const;
}
