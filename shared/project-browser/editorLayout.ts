import type { EditorGroup, EditorLayout, EditorSplit } from './editorGroups';

export const MIN_PANE_WIDTH = 240;
export const MIN_PANE_HEIGHT = 220;
export interface EditorFrame { left: number; top: number; width: number; height: number }
export interface DividerFrame {
  split: EditorSplit; frame: EditorFrame; vertical: boolean; firstMinimum: number; secondMinimum: number;
}

export function minimumEditorSize(layout: EditorLayout, narrow: boolean): { width: number; height: number } {
  if (layout.kind === 'group') return { width: MIN_PANE_WIDTH, height: MIN_PANE_HEIGHT };
  const first = minimumEditorSize(layout.first, narrow), second = minimumEditorSize(layout.second, narrow);
  const vertical = narrow || layout.direction === 'down';
  return { width: vertical ? Math.max(first.width, second.width)
    : Math.max(first.width / layout.ratio, second.width / (1 - layout.ratio)),
    height: vertical ? Math.max(first.height / layout.ratio, second.height / (1 - layout.ratio))
      : Math.max(first.height, second.height) };
}

/** Flat keyed panes keep their editor instances and undo history when the split tree changes. */
export function editorLayoutFrames(layout: EditorLayout, narrow: boolean) {
  const groups: { group: EditorGroup; frame: EditorFrame }[] = [];
  const dividers: DividerFrame[] = [];
  const visit = (node: EditorLayout, frame: EditorFrame) => {
    if (node.kind === 'group') { groups.push({ group: node, frame }); return; }
    const vertical = narrow || node.direction === 'down';
    const axis = vertical ? 'height' : 'width', position = vertical ? 'top' : 'left';
    const first = { ...frame, [axis]: frame[axis] * node.ratio };
    const second = { ...frame, [axis]: frame[axis] * (1 - node.ratio),
      [position]: frame[position] + frame[axis] * node.ratio };
    dividers.push({ split: node, frame, vertical, firstMinimum: minimumEditorSize(node.first, narrow)[axis],
      secondMinimum: minimumEditorSize(node.second, narrow)[axis] });
    visit(node.first, first); visit(node.second, second);
  };
  visit(layout, { left: 0, top: 0, width: 100, height: 100 });
  return { groups, dividers };
}

export const frameStyle = (frame: EditorFrame) => ({
  left: `${frame.left}%`, top: `${frame.top}%`, width: `${frame.width}%`, height: `${frame.height}%`,
});
