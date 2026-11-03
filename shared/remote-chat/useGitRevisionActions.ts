import { useEffect, useState } from 'react';
import type { GitChanges, GitClient, GitCommit, GitResetMode, GitRevisionPrompt } from './gitTypes';

interface Options {
  client: GitClient; cwd: string; scope: object; changes: GitChanges | null; connected: boolean; busy: boolean;
  isCurrent: () => boolean; run: (action: () => Promise<void>) => Promise<void>; load: () => Promise<void>;
  setNotice: (notice: string) => void; onDone: () => void;
}

export function useGitRevisionActions(options: Options) {
  const { client, cwd, scope, changes, connected, busy, isCurrent, run, load, setNotice, onDone } = options;
  const [revisionAction, setRevisionAction] = useState<GitRevisionPrompt | null>(null);
  useEffect(() => { setRevisionAction(null); }, [scope]);
  const requestRevisionAction = (action: GitRevisionPrompt['action'], commit: GitCommit) => {
    if (!changes || busy || !connected || changes.files.some(file => file.conflict)) return;
    if (action === 'reset' && !changes.branch) return;
    setRevisionAction({ action, commit: commit.hash, subject: commit.subject, head: changes.head,
      branch: changes.branch, files: changes.files.map(({ path, version }) => ({ path, version })) });
  };
  const confirmRevisionAction = (mode: GitResetMode) => run(async () => {
    if (!revisionAction) return;
    const { subject: _subject, ...request } = revisionAction;
    let failure: unknown;
    try {
      await client.revision({ ...request, cwd, ...(request.action === 'reset' && { mode }) });
      if (!isCurrent()) return;
      setRevisionAction(null); onDone();
      setNotice(request.action === 'checkout' ? '已检出所选提交' : '当前分支已重置');
    } catch (error) { failure = error; }
    try { await load(); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  });
  const performHistoryAction = (action: () => Promise<void>, notice: string) => run(async () => {
    await action();
    if (isCurrent()) setNotice(notice);
  });
  return { revisionAction, requestRevisionAction, confirmRevisionAction, performHistoryAction,
    cancelRevisionAction: () => { if (!busy) setRevisionAction(null); } };
}
