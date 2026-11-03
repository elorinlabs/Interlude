import { useEffect } from 'react';
import { canSave, type DocumentTab, type ProjectDocuments } from './documents';

export function useAutoSave(options: {
  tabs: DocumentTab[]; store: ProjectDocuments; delay: number; enabled: boolean;
}) {
  const { tabs, store, delay, enabled } = options;
  useEffect(() => {
    if (!enabled || !delay) return;
    const timers = tabs.filter(tab => canSave(tab) && !tab.error).map(tab =>
      setTimeout(() => { void store.save(tab.path); }, Math.max(0, tab.editedAt + delay - Date.now())));
    return () => timers.forEach(clearTimeout);
  }, [tabs, store, delay, enabled]);
}
