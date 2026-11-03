const STORAGE_KEY = 'codex-switch:message-queue-enabled';
const CHANGE_EVENT = 'codex-switch:message-queue-changed';

/** Missing preferences (including native clients) preserve the existing queue behavior. */
export function isMessageQueueEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== 'false'; }
  catch { return true; }
}

export function saveMessageQueueEnabled(enabled: boolean): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch { return false; }
}

export function subscribeMessageQueueSettings(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
