import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import type { ProjectFile } from '../remote-chat/projectFiles';
import { useTreeGesture } from './useTreeGesture';
import type { TreeCommand, TreeMenu } from './useTreeActions';

export function ProjectTreeRow({ entry, depth, expanded, selected, disabled, cut, open, menu, command, relativePath }: {
  entry: ProjectFile; depth: number; expanded: boolean; selected: boolean; disabled: boolean; cut: boolean;
  open: () => void; menu: (menu: TreeMenu) => void; command: (entry: ProjectFile, action: TreeCommand) => void;
  relativePath?: string;
}) {
  const gesture = useTreeGesture(position => menu({ entry, ...position }));
  const Icon = entry.directory ? (expanded ? FolderOpen : Folder) : File;
  return <button type="button" role="treeitem" aria-level={depth + 1}
    aria-expanded={entry.directory ? expanded : undefined} aria-selected={selected} disabled={disabled}
    className="pf-tree-row" data-cut={cut || undefined} data-path={entry.path} data-directory={entry.directory}
    aria-label={entry.name}
    aria-description={relativePath}
    {...gesture} onClick={open} onKeyDown={event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect();
        menu({ entry, x: rect.left + 20, y: rect.bottom }); return;
      }
      let action: TreeCommand | undefined;
      if (event.key === 'Delete') action = 'delete';
      if (event.key === 'F2' || (event.shiftKey && event.key === 'F6')) action = 'rename';
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (event.key.toLowerCase() === 'c') action = event.shiftKey ? 'copyPath' : 'copy';
        if (event.key.toLowerCase() === 'x') action = 'cut';
        if (event.key.toLowerCase() === 'v' && entry.directory) action = 'paste';
      }
      if (action) { event.preventDefault(); event.stopPropagation(); command(entry, action); return; }
      if (entry.directory && ((event.key === 'ArrowRight' && !expanded)
        || (event.key === 'ArrowLeft' && expanded))) { event.preventDefault(); open(); }
    }}>
    {entry.directory ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
      : <span className="pf-tree-spacer" />}
    <Icon size={16} /><span className="pf-tree-entry"><span>{entry.name}</span>
      {relativePath && <small>{relativePath}</small>}</span>
  </button>;
}
