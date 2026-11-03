import { useEffect, useState } from 'react';

/** Selection belongs to the current account/view and only includes tasks still in that view. */
export function useDownloadSelection(tasks: readonly { id: string }[], scope: string) {
  const [selection, setSelection] = useState({ scope, ids: new Set<string>() });
  const available = new Set(tasks.map(task => task.id));
  const selected = new Set([...selection.ids].filter(id => selection.scope === scope && available.has(id)));

  useEffect(() => {
    setSelection(previous => {
      const ids = [...previous.ids].filter(id => previous.scope === scope && available.has(id));
      if (previous.scope === scope && ids.length === previous.ids.size) return previous;
      return { scope, ids: new Set(ids) };
    });
  }, [tasks, scope]);

  const toggle = (id: string) => {
    if (!available.has(id)) return;
    setSelection(previous => {
      const ids = new Set([...previous.ids].filter(value => previous.scope === scope && available.has(value)));
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { scope, ids };
    });
  };
  const allSelected = available.size > 0 && selected.size === available.size;
  const toggleAll = () => {
    setSelection(previous => {
      const hasAll = previous.scope === scope && [...available].every(id => previous.ids.has(id));
      return { scope, ids: hasAll ? new Set<string>() : new Set(available) };
    });
  };
  const clear = () => setSelection({ scope, ids: new Set<string>() });
  return { selected, toggle, allSelected, toggleAll, clear };
}
