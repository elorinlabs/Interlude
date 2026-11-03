import { useEffect, useRef, useState } from 'react';
import type { QueueDraft } from '../queue';
import type { QueueProps } from './queueProps';

interface Options {
  threadId: string | null;
  queue?: QueueProps;
  disabled: boolean;
  restore: (message: QueueDraft) => void;
}

/** Keep a fetched draft until its conversation is visible and the composer is available. */
export function useQueueEditor({ threadId, queue, disabled, restore }: Options) {
  const pending = useRef(new Map<string, QueueDraft>());
  const fetching = useRef(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!threadId || disabled || loading) return;
    const message = pending.current.get(threadId);
    if (!message) return;
    restore(message);
    pending.current.delete(threadId);
  }, [threadId, disabled, loading, restore]);
  const edit = async (id: string) => {
    if (!queue || !threadId || disabled || fetching.current || pending.current.has(threadId)) return;
    fetching.current = true; setLoading(true);
    try {
      const message = await queue.take(id);
      if (message) pending.current.set(threadId, message);
    } finally { fetching.current = false; setLoading(false); }
  };
  return { edit, loading, editDisabled: disabled || loading };
}
