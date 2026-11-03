import { remoteErrorText } from '../localization/errors';
import { MoreHorizontal, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ProjectBrowserClient } from './protocol';
import { useProjectTree, type DirectoryState } from './useProjectTree';
import { normalizedPath, parentPath, type BrowserHost } from './entryActions';
import type { ProjectDocuments } from './documents';
import { ProjectTreeRow } from './ProjectTreeRow';
import { useTreeActions } from './useTreeActions';
import { useTreeGesture } from './useTreeGesture';
import { TreeMenu } from './TreeMenu';
import { TreeActionDialog } from './TreeActionDialog';
import { useProjectTreeSearch } from './useProjectTreeSearch';
import { ProjectTreeSearch, ProjectTreeSearchNotice } from './ProjectTreeSearch';
import type { ProjectFile } from '../remote-chat/projectFiles';

export type BrowserTranslate = (source: string) => string;
export interface ProjectTreeOptions {
  root?: string;
  /** Replace the folder heading while retaining its menu and refresh controls. */
  renderToolbar?: (actions: { refresh: ReactNode; menu: ReactNode }) => ReactNode;
  /** Add host-specific controls to the root folder menu. */
  renderRootMenuExtras?: (close: () => void) => ReactNode;
  /** Add host-specific actions for the selected entry, including the root folder. */
  renderMenuExtras?: (entry: ProjectFile, close: () => void) => ReactNode;
  showHidden?: boolean;
  /** A host upload changes this token to refresh loaded folders without losing expansion. */
  revision?: unknown;
}

function DirectoryNotice({ state, retry, t }: {
  state?: DirectoryState; retry: () => void; t: BrowserTranslate;
}) {
  if (state?.loading) return <p className="pf-notice" role="status">{t("client.projectBrowser.loading")}</p>;
  if (state?.error) return <div className="pf-notice" role="alert">{remoteErrorText(state.error)}
    <button type="button" onClick={retry}>{t("client.terminal.retry")}</button></div>;
  if (state?.data?.truncated) return <p className="pf-notice">{t("client.downloads.onlyTheFirst500EntriesAreShown")}</p>;
  if (state?.data && !state.data.entries.length) return <p className="pf-notice">{t("client.projectBrowser.thisFolderIsEmpty")}</p>;
  return null;
}

export function ProjectTree({ client, cwd, connected, selected, choose, t, host, documents, options }: {
  client: ProjectBrowserClient; cwd: string; connected: boolean; selected?: string;
  choose: (path: string) => void; t: BrowserTranslate;
  host: BrowserHost; documents: ProjectDocuments;
  options?: ProjectTreeOptions;
}) {
  const tree = useProjectTree(client, cwd, connected);
  const search = useProjectTreeSearch(client, cwd, connected);
  const list = useRef<HTMLDivElement>(null);
  const [revealPath, setRevealPath] = useState('');
  const actions = useTreeActions({ cwd, connected, host, documents, choose });
  const previousRevision = useRef(options?.revision);
  useEffect(() => {
    if (previousRevision.current === options?.revision) return;
    previousRevision.current = options?.revision;
    void tree.reload(); search.refresh();
  }, [options?.revision, tree.reload, search.refresh]);
  useEffect(() => documents.subscribeEntries(({ request, path }) => {
    search.refresh();
    const change = ['rename', 'move', 'delete'].includes(request.action)
      ? { from: request.path, to: path, deleted: request.action === 'delete' } : undefined;
    return tree.reload(request.action === 'createFolder' ? request.path : parentPath(path), change);
  }), [documents, tree.reload, search.refresh]);
  useEffect(() => {
    if (!revealPath || search.active) return;
    const row = [...(list.current?.querySelectorAll<HTMLButtonElement>('.pf-tree-row') ?? [])]
      .find(row => row.dataset.path === revealPath);
    if (row) { row.focus(); row.scrollIntoView({ block: 'nearest' }); setRevealPath(''); }
  }, [revealPath, search.active, tree.rows]);
  const candidates = search.active ? search.entries.map(entry => ({ entry, depth: 0 })) : tree.rows;
  const rows = options?.showHidden === false ? candidates.filter(({ entry }) =>
    !entry.path.slice(cwd.replace(/\/+$/, '').length).split('/').some(part => part.startsWith('.'))) : candidates;
  const root = { path: cwd, name: cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd, directory: true };
  const rootGesture = useTreeGesture(position => actions.show({ entry: root, ...position }));
  const menu = <button type="button" aria-label={t("client.projectBrowser.projectFolderActions")}
    disabled={!connected || actions.busy} onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      actions.show({ entry: root, x: rect.left, y: rect.bottom });
    }}><MoreHorizontal size={16} /></button>;
  const refresh = <button type="button" aria-label={t("client.projectBrowser.refreshFileTree")}
    disabled={!connected} onClick={() => { tree.refresh(); search.refresh(); }}><RefreshCw size={16} /></button>;
  return <nav className="pf-tree" aria-label={t("client.projectBrowser.projectFiles")}>
    {options?.renderToolbar ? options.renderToolbar({ refresh, menu })
      : <div className="pf-tree-heading"><span {...rootGesture}>{root.name}</span>{menu}{refresh}</div>}
    <ProjectTreeSearch query={search.query} disabled={!connected} t={t}
      change={value => { actions.close(); search.change(value); }} />
    <div ref={list} role="tree" aria-label={t("client.projectBrowser.projectFiles")}
      className="pf-tree-list" aria-busy={search.loading} onContextMenu={event => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault(); actions.show({ entry: root, x: event.clientX, y: event.clientY });
      }}>
      {rows.map(({ entry, depth }) => {
        const expanded = !search.active && tree.expanded.has(entry.path);
        return <div key={entry.path} role="none"
          style={{ '--pf-tree-row-indent': `${10 + depth * 16}px` } as CSSProperties}>
          <ProjectTreeRow entry={entry} depth={depth} expanded={expanded} selected={selected === entry.path}
            relativePath={search.active ? entry.relativePath
              ?? normalizedPath(entry.path).slice(normalizedPath(cwd).length + 1) : undefined}
            disabled={!connected || actions.busy} cut={!!actions.clipboard?.cut
              && actions.clipboard.entry.path === entry.path}
            open={() => {
              if (!entry.directory) { choose(entry.path); return; }
              if (!search.active) { tree.toggle(entry); return; }
              search.change(''); void tree.reveal(entry.path); setRevealPath(entry.path);
            }}
            menu={actions.show} command={actions.command} />
          {entry.directory && expanded && <DirectoryNotice state={tree.directories[entry.path]}
            retry={() => void tree.load(entry.path)} t={t} />}
        </div>;
      })}
      {search.active ? connected && <ProjectTreeSearchNotice search={search} t={t} />
        : <DirectoryNotice state={tree.directories['']} retry={() => void tree.load('')} t={t} />}
    </div>
    {actions.message && <p role="status" className="pf-notice">{remoteErrorText(actions.message)}</p>}
    {actions.error && !actions.prompt && <p role="alert" className="pf-notice">{remoteErrorText(actions.error)}</p>}
    {actions.menu && <TreeMenu menu={actions.menu} cwd={cwd} host={host}
      canPaste={!!actions.clipboard} close={actions.close} t={t}
      extraItems={options?.renderMenuExtras?.(actions.menu.entry, actions.close)}
      command={command => actions.command(actions.menu!.entry, command)}>
      {options?.renderRootMenuExtras?.(actions.close)}
    </TreeMenu>}
    {actions.prompt && <TreeActionDialog key={`${actions.prompt.action}:${actions.prompt.entry.path}`}
      prompt={actions.prompt} busy={actions.busy} connected={connected} error={actions.error}
      confirm={name => { void actions.confirm(name); }} cancel={actions.cancel} t={t} />}
  </nav>;
}
