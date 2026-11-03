import { useSyncExternalStore } from 'react';

const VISIBILITY_KEY = 'codex-switch:help-assistant-visible';
const VISIBILITY_EVENT = 'codex-switch:help-assistant-visibility-changed';

function isVisible(): boolean {
  try {
    return window.localStorage.getItem(VISIBILITY_KEY) !== 'false';
  } catch {
    return true;
  }
}

function setVisible(visible: boolean): boolean {
  try {
    window.localStorage.setItem(VISIBILITY_KEY, String(visible));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(VISIBILITY_EVENT));
  return true;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === VISIBILITY_KEY || event.key === null) onChange();
  };
  window.addEventListener(VISIBILITY_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(VISIBILITY_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useHelpAssistantVisibility() {
  const visible = useSyncExternalStore(subscribe, isVisible);
  return { visible, setVisible };
}
