import { useEffect, useState } from 'react';
import type { GitChanges, GitClient, GitConflict } from './gitTypes';

interface Options {
  client: GitClient; cwd: string; scope: object; changes: GitChanges | null; enabled: boolean; busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>; load: () => Promise<void>;
  isCurrent: () => boolean; setNotice: (notice: string) => void;
}

/** Keep the editor snapshot stable during polling; the host validates it again before writing. */
export function useGitConflicts(options: Options) {
  const { client, cwd, scope, enabled, busy, run, load, isCurrent, setNotice } = options;
  const [conflictPath, setConflictPath] = useState<string | null>(null);
  const [conflict, setConflict] = useState<GitConflict | null>(null);
  useEffect(() => { setConflictPath(null); setConflict(null); }, [scope]);
  const openConflict = (path: string) => {
    if (!enabled || busy) return;
    setConflictPath(path); setConflict(null);
    return run(async () => {
      const value = await client.conflict(cwd, path);
      if (isCurrent()) setConflict(value);
    });
  };
  const saveConflict = (content: string | null) => run(async () => {
    if (!conflict) return;
    await client.resolveConflict({ cwd, path: conflict.path, version: conflict.version, content });
    if (!isCurrent()) return;
    setConflictPath(null); setConflict(null); setNotice('client.gitConflict.saved');
    await load();
  });
  const continueIntegration = () => run(async () => {
    const state = options.changes?.integration;
    if (!state || options.changes?.files.some(file => file.conflict)) return;
    try {
      await client.continueIntegration(cwd, state.version);
      if (isCurrent()) setNotice('client.gitConflict.continued');
    } finally { if (isCurrent()) await load(); }
  });
  return { conflictPath, conflict, openConflict, saveConflict, continueIntegration,
    closeConflict: () => { if (!busy) { setConflictPath(null); setConflict(null); } } };
}
