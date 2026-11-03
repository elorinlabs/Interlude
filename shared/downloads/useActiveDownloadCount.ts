import { useEffect, useSyncExternalStore } from 'react';

interface CountableDownload {
  status: string;
  source: { owner: string; preview?: unknown };
}

interface DownloadStore {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => readonly CountableDownload[];
  initialize: () => Promise<void>;
}

const ACTIVE_STATUSES = new Set(['queued', 'preparing', 'downloading', 'verifying']);
const subscribeDisabled = () => () => {};

/** Subscribe to the count itself so byte progress never rerenders navigation. */
export function useActiveDownloadCount({ manager, owners, enabled = true }: {
  manager: DownloadStore;
  owners: readonly (string | undefined)[];
  enabled?: boolean;
}) {
  const count = useSyncExternalStore(enabled ? manager.subscribe : subscribeDisabled, () => enabled
    ? manager.snapshot().filter(task => owners.includes(task.source.owner)
      && !task.source.preview && ACTIVE_STATUSES.has(task.status)).length : 0, () => 0);
  useEffect(() => { if (enabled) void manager.initialize(); }, [manager, enabled]);
  return count;
}
