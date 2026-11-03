import { useEffect, useRef, useState } from 'react';
import type { SshProfile, SshProfileStore } from './sshProfiles';
import { sshProfileError } from './sshProfileResponse';
import type { SshCredentials } from './sshCredentials';

const REFRESH_MS = 15_000;

/** Never present local-only writes as synchronized when the server is unavailable. */
export function useSshProfiles(store: SshProfileStore, live = true) {
  const [profiles, setProfiles] = useState<SshProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  const reading = useRef<symbol>();
  const writing = useRef(new Set<symbol>());
  const refresh = async (background = false) => {
    if (reading.current || writing.current.size) return;
    const request = Symbol(); reading.current = request;
    const current = ++version.current;
    if (!background) setLoading(true);
    try {
      const values = await store.list();
      if (current === version.current) { setProfiles(values); setError(store.warning?.() ?? ''); }
    } catch (failure) {
      if (current === version.current) setError(sshProfileError(failure, 'client.ssh.loadFailed'));
    } finally {
      if (reading.current === request) reading.current = undefined;
      if (current === version.current) setLoading(false);
    }
  };
  useEffect(() => {
    reading.current = undefined;
    writing.current = new Set();
    setProfiles([]); void refresh();
    const timer = live ? setInterval(() => { void refresh(true); }, REFRESH_MS) : undefined;
    return () => { version.current += 1; clearInterval(timer); };
  }, [store, live]);
  const mutate = async (action: () => Promise<SshProfile[]>) => {
    const current = ++version.current;
    const writes = writing.current; const request = Symbol(); writes.add(request);
    try {
      const values = await action();
      if (current === version.current) { setProfiles(values); setError(''); }
      return values;
    } catch (failure) { throw new Error(sshProfileError(failure, 'client.ssh.storageFailed')); }
    finally { writes.delete(request); if (current === version.current) setLoading(false); }
  };
  return { profiles, loading, error, refresh: () => refresh(),
    save: (value: SshProfile, credentials?: SshCredentials) =>
      mutate(() => credentials ? store.save(value, credentials) : store.save(value)),
    remove: (id: string, revision?: number, accountScope?: string) =>
      mutate(() => store.remove(id, revision, accountScope)) };
}
