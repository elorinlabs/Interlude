import { useEffect, useState } from 'react';
import type { GitStatus, GitWorkspaceClient } from '../remote-chat/gitWorkspace';

const REFRESH_INTERVAL_MS = 10_000;

interface WorkspaceSnapshot {
  cwd: string;
  request: GitWorkspaceClient;
  status?: GitStatus;
}

/** Read the active conversation's checkout without allowing workspace mutations. */
export function useConversationWorkspace({ cwd, request, enabled }: {
  cwd: string; request: GitWorkspaceClient; enabled: boolean;
}) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>();
  useEffect(() => {
    if (!enabled || !cwd) return;
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (cancelled || pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const status = await request({ operation: 'status', cwd });
        if (!cancelled) setSnapshot({ cwd, request, status });
      } catch {
        // Git may be unavailable or this directory may not be a repository. Never show an old branch.
        if (!cancelled) setSnapshot({ cwd, request });
      } finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
    const resume = () => { void refresh(); };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [cwd, request, enabled]);
  const current = snapshot?.cwd === cwd && snapshot.request === request ? snapshot : undefined;
  return { status: current?.status, loading: enabled && Boolean(cwd) && !current };
}
