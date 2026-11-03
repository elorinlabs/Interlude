import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ProjectBrowserClient } from './protocol';
import { isDirty, ProjectDocuments, type DocumentsSnapshot } from './documents';

const projects = new WeakMap<ProjectBrowserClient, Map<string, ProjectDocuments>>();
function projectDocuments(client: ProjectBrowserClient, cwd: string, initial?: DocumentsSnapshot) {
  let workspaces = projects.get(client);
  if (!workspaces) { workspaces = new Map(); projects.set(client, workspaces); }
  let store = workspaces.get(cwd);
  if (!store) { store = new ProjectDocuments(client, cwd, initial); workspaces.set(cwd, store); }
  return store;
}

export function useProjectDocument(client: ProjectBrowserClient, cwd: string, initial?: DocumentsSnapshot) {
  const store = useMemo(() => projectDocuments(client, cwd, initial), [client, cwd]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => store.resumeReads(), [store]);
  const active = store.get(state.activePath);
  return {
    store, ...state, active,
    document: active?.document, text: active?.text ?? '', loading: active?.loading ?? false,
    saving: active?.saving ?? false, error: active?.error ?? '', saved: active?.saved ?? false,
    editorVersion: active?.editorVersion ?? 0, dirty: !!active && isDirty(active),
    open: store.open,
    edit: (text: string) => { if (active) store.edit(active.path, text); },
    save: () => active ? store.save(active.path) : Promise.resolve(false),
  };
}
