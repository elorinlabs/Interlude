export type SplitDirection = 'right' | 'down';
export interface EditorGroup {
  kind: 'group'; id: string; paths: string[]; activePath?: string;
}
export interface EditorSplit {
  kind: 'split'; id: string; direction: SplitDirection; ratio: number;
  first: EditorLayout; second: EditorLayout;
}
export type EditorLayout = EditorGroup | EditorSplit;

export const emptyGroup = (): EditorGroup => ({ kind: 'group', id: 'main', paths: [] });
export function editorGroups(layout: EditorLayout): EditorGroup[] {
  return layout.kind === 'group' ? [layout] : [...editorGroups(layout.first), ...editorGroups(layout.second)];
}
export function editorLayoutIds(layout: EditorLayout): string[] {
  return layout.kind === 'group' ? [layout.id]
    : [layout.id, ...editorLayoutIds(layout.first), ...editorLayoutIds(layout.second)];
}

export function mapEditorGroups(layout: EditorLayout, change: (group: EditorGroup) => EditorLayout): EditorLayout {
  if (layout.kind === 'group') return change(layout);
  return { ...layout, first: mapEditorGroups(layout.first, change), second: mapEditorGroups(layout.second, change) };
}

function pruneEmptyGroups(layout: EditorLayout): EditorLayout | undefined {
  if (layout.kind === 'group') return layout.paths.length ? layout : undefined;
  const first = pruneEmptyGroups(layout.first), second = pruneEmptyGroups(layout.second);
  if (!first) return second;
  if (!second) return first;
  return { ...layout, first, second };
}

export function removeGroupPaths(layout: EditorLayout, groupId: string, paths: string[]) {
  const updated = mapEditorGroups(layout, group => {
    if (group.id !== groupId) return group;
    const remaining = group.paths.filter(path => !paths.includes(path));
    const index = group.activePath ? group.paths.indexOf(group.activePath) : 0;
    return { ...group, paths: remaining, activePath: remaining.includes(group.activePath ?? '')
      ? group.activePath : remaining[Math.min(index, remaining.length - 1)] };
  });
  return pruneEmptyGroups(updated) ?? emptyGroup();
}

export function rebaseGroupPaths(layout: EditorLayout, rebase: (path: string) => string | undefined) {
  const updated = mapEditorGroups(layout, group => {
    const paths = group.paths.map(rebase).filter((path): path is string => path !== undefined);
    const active = group.activePath ? rebase(group.activePath) : undefined;
    return { ...group, paths, activePath: paths.includes(active ?? '') ? active : paths.at(-1) };
  });
  return pruneEmptyGroups(updated) ?? emptyGroup();
}

export function splitEditorGroup(layout: EditorLayout, options: {
  groupId: string; path: string; direction: SplitDirection; move: boolean; id: string;
}) {
  return mapEditorGroups(layout, group => {
    if (group.id !== options.groupId || !group.paths.includes(options.path)) return group;
    const paths = options.move ? group.paths.filter(path => path !== options.path) : group.paths;
    return { kind: 'split', id: `split-${options.id}`, direction: options.direction, ratio: 0.5,
      first: { ...group, paths, activePath: paths.includes(group.activePath ?? '') ? group.activePath : paths.at(-1) },
      second: { kind: 'group', id: options.id, paths: [options.path], activePath: options.path } };
  });
}

export function resizeEditorSplit(layout: EditorLayout, id: string, ratio: number): EditorLayout {
  if (layout.kind === 'group') return layout;
  if (layout.id === id) return { ...layout, ratio };
  return { ...layout, first: resizeEditorSplit(layout.first, id, ratio),
    second: resizeEditorSplit(layout.second, id, ratio) };
}
