import { useRef, useState } from 'react';
import { isDirty, type ProjectDocuments } from './documents';
import { editorGroups } from './editorGroups';
import { tabsToClose, type CloseTabCommand, type TabCommand, type TabTarget } from './tabCommands';
import type { BrowserHost } from './entryActions';
import type { TreePrompt } from './useTreeActions';
import { browserError } from './useProjectTree';

interface PendingAction { paths: string[]; action: () => void }

export function useTabActions(options: {
  store: ProjectDocuments; cwd: string; connected: boolean; host: BrowserHost;
}) {
  const { store, cwd, connected, host } = options;
  const [pending, setPending] = useState<PendingAction>();
  const [rename, setRename] = useState<TreePrompt>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const flight = useRef(false);
  const guard = (paths: string[], action: () => void) => {
    if (flight.current || store.getSnapshot().mutationPath || paths.some(path => store.get(path)?.saving)) return;
    const dirty = paths.filter(path => { const tab = store.get(path); return tab && isDirty(tab); });
    if (dirty.length) setPending({ paths: dirty, action }); else action();
  };
  const advance = () => {
    if (!pending) return;
    const paths = pending.paths.slice(1);
    if (paths.length) setPending({ ...pending, paths });
    else { setPending(undefined); pending.action(); }
  };
  const close = (target: TabTarget, command: CloseTabCommand = 'close') => {
    const group = editorGroups(store.getSnapshot().layout).find(group => group.id === target.groupId);
    const tabs = group?.paths.flatMap(path => { const tab = store.get(path); return tab ? [tab] : []; }) ?? [];
    const paths = tabsToClose(tabs, target.path, command);
    if (paths.some(path => store.get(path)?.saving)) return;
    guard(store.lastViews(target.groupId, paths), () => store.closeTabs(target.groupId, paths));
  };
  const run = async (action: () => Promise<void>) => {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError(''); setFeedback('');
    try { await action(); }
    catch (cause) { setError(browserError(cause)); }
    finally { flight.current = false; setBusy(false); }
  };
  const command = (target: TabTarget, action: TabCommand) => {
    setError(''); setFeedback('');
    if (action === 'rename') {
      if (!connected || store.getSnapshot().mutationPath) return;
      setRename({ action: 'rename', entry: { path: target.path,
        name: target.path.split(/[\\/]/).at(-1) ?? target.path, directory: false } }); return;
    }
    if (action === 'copyPath') {
      void run(async () => { await host.copyPath(target.path); setFeedback('路径已复制。'); }); return;
    }
    if (action === 'splitRight' || action === 'moveRight' || action === 'splitDown' || action === 'moveDown') {
      store.split({ ...target, direction: action.endsWith('Right') ? 'right' : 'down',
        move: action.startsWith('move') }); return;
    }
    close(target, action);
  };
  return { pending, rename, busy, error, feedback, guard, close, command,
    cancelPending: () => setPending(undefined), discard: advance,
    savePending: async () => {
      if (connected && pending && await store.saveAll([pending.paths[0]])) advance();
    },
    cancelRename: () => { if (!flight.current) { setRename(undefined); setError(''); } },
    confirmRename: (name: string) => run(async () => {
      if (!rename || !connected) return;
      await store.mutate({ cwd, path: rename.entry.path, action: 'rename', name });
      setRename(undefined);
    }),
  };
}
