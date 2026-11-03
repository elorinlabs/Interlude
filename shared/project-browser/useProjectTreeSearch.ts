import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectFile } from '../remote-chat/projectFiles';
import type { ProjectBrowserClient } from './protocol';

const SEARCH_DELAY_MS = 200;
const empty = { entries: [] as ProjectFile[], loading: false, failed: false, truncated: false };

/** Search the whole project, serialize requests and discard results from an outdated query or connection. */
export function useProjectTreeSearch(client: ProjectBrowserClient, cwd: string, connected: boolean) {
  const [input, setInput] = useState({ cwd, value: '' });
  const [revision, setRevision] = useState(0);
  const query = input.cwd === cwd ? input.value : '';
  const term = query.trim();
  const active = !!term;
  const key = JSON.stringify([cwd, term, connected, revision]);
  const [result, setResult] = useState({ ...empty, key: '', client });
  const pending = useRef<Promise<void>>();
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const change = (value: string) => setInput({ cwd, value });
  useEffect(() => {
    setResult({ ...empty, loading: active && connected, key, client });
    if (!active || !connected) return;
    let cancelled = false;
    const search = async () => {
      await pending.current;
      if (cancelled) return;
      const request = async () => {
        try {
          const response = await client.list(cwd, undefined, term);
          if (!cancelled) setResult({ ...empty, key, client,
            entries: response.entries, truncated: response.truncated });
        } catch {
          if (!cancelled) setResult({ ...empty, key, client, failed: true });
        }
      };
      pending.current = request();
      await pending.current;
    };
    const timer = setTimeout(() => void search(), SEARCH_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, connected, cwd, term, key, client]);
  const current = active && connected && result.key === key && result.client === client;
  const state = current ? result : { ...empty, loading: active && connected };
  return { ...state, query, active, change, refresh };
}
