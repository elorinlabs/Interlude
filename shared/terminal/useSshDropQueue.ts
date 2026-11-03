import { useEffect, useRef, useState } from 'react';
import { releaseSshUploadBatch, type SshUploadBatch } from './sshDrop';

export interface PendingSshUpload {
  id: string;
  batch: SshUploadBatch;
  complete: () => void;
}

/** Keep the upload owned by its SSH session while opening the file drawer. */
export function useSshDropQueue(sessionIds: string[]) {
  const [pending, setPending] = useState<PendingSshUpload[]>([]);
  const entries = useRef(new Map<string, PendingSshUpload>());
  const mounted = useRef(true);
  const sessionKey = JSON.stringify(sessionIds);
  useEffect(() => {
    const present = new Set<string>(JSON.parse(sessionKey));
    for (const entry of entries.current.values()) if (!present.has(entry.id)) entry.complete();
  }, [sessionKey]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const entry of entries.current.values()) entry.complete();
    };
  }, []);
  const enqueue = (id: string, batch: SshUploadBatch) => new Promise<void>(resolve => {
    if (!mounted.current || entries.current.has(id)) {
      void releaseSshUploadBatch(batch).then(resolve);
      return;
    }
    let completed = false;
    const entry: PendingSshUpload = { id, batch, complete: () => {
      if (completed) return;
      completed = true;
      entries.current.delete(id);
      if (mounted.current) setPending(Array.from(entries.current.values()));
      void releaseSshUploadBatch(batch).then(resolve);
    } };
    entries.current.set(id, entry);
    setPending(Array.from(entries.current.values()));
  });
  return { pending, enqueue };
}
