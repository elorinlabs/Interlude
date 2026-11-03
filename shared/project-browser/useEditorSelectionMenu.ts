import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { selectedFileText, type FileSelection } from './fileSelection';

const LONG_PRESS_DELAY = 500;
const MOVE_TOLERANCE = 10;
export interface SelectionMenu {
  selection: FileSelection; x: number; y: number; touch: boolean;
}

/** Prefer the DOM range while a native touch-selection handle is still being dragged. */
export function readEditorSelection(editor: EditorView, path: string) {
  const selection = editor.dom.ownerDocument.getSelection();
  if (selection?.anchorNode && selection.focusNode
    && editor.contentDOM.contains(selection.anchorNode) && editor.contentDOM.contains(selection.focusNode)) {
    if (selection.isCollapsed) return null;
    const anchor = editor.posAtDOM(selection.anchorNode, selection.anchorOffset);
    const head = editor.posAtDOM(selection.focusNode, selection.focusOffset);
    return selectedFileText(editor.state.update({ selection: EditorSelection.single(anchor, head) }).state, path);
  }
  return selectedFileText(editor.state, path);
}

export function useEditorSelectionMenu(options: {
  view: MutableRefObject<EditorView | undefined>; path: string; enabled: boolean;
}) {
  const [menu, setMenu] = useState<SelectionMenu | null>(null);
  const touch = useRef(false);
  const close = useCallback(() => { touch.current = false; setMenu(null); }, []);
  const changed = (documentChanged: boolean) => {
    if (documentChanged) close();
    else if (!touch.current) setMenu(null);
  };
  useEffect(() => {
    const editor = options.view.current;
    if (!editor || !options.enabled) { close(); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number } | undefined;
    const cancelTimer = () => { clearTimeout(timer); timer = undefined; };
    const open = (x: number, y: number) => {
      const selection = readEditorSelection(editor, options.path);
      setMenu(selection ? { selection, x, y, touch: touch.current } : null);
      return !!selection;
    };
    const contextMenu = (event: MouseEvent) => {
      if (event.shiftKey) return;
      if (!open(event.clientX, event.clientY)) return;
      // Touch keeps the system selection menu and handles; the extra action is docked below the editor.
      if (!touch.current) { event.preventDefault(); event.stopPropagation(); }
    };
    const down = (event: PointerEvent) => {
      cancelTimer();
      touch.current = event.pointerType === 'touch' || event.pointerType === 'pen';
      if (!touch.current) return;
      start = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => open(event.clientX, event.clientY), LONG_PRESS_DELAY);
    };
    const move = (event: PointerEvent) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancelTimer();
    };
    const selectionChanged = () => {
      if (!touch.current) return;
      if (editor.contentDOM.contains(document.getSelection()?.anchorNode ?? null)) open(0, 0);
      else setMenu(null);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      touch.current = false;
      const rect = editor.coordsAtPos(editor.state.selection.main.head);
      if (rect && open(rect.left, rect.bottom)) { event.preventDefault(); event.stopPropagation(); }
    };
    editor.contentDOM.addEventListener('contextmenu', contextMenu);
    editor.contentDOM.addEventListener('keydown', keydown);
    editor.contentDOM.addEventListener('pointerdown', down);
    editor.contentDOM.addEventListener('pointermove', move);
    editor.contentDOM.addEventListener('pointerup', cancelTimer);
    editor.contentDOM.addEventListener('pointercancel', cancelTimer);
    document.addEventListener('selectionchange', selectionChanged);
    return () => {
      cancelTimer();
      editor.contentDOM.removeEventListener('contextmenu', contextMenu);
      editor.contentDOM.removeEventListener('keydown', keydown);
      editor.contentDOM.removeEventListener('pointerdown', down);
      editor.contentDOM.removeEventListener('pointermove', move);
      editor.contentDOM.removeEventListener('pointerup', cancelTimer);
      editor.contentDOM.removeEventListener('pointercancel', cancelTimer);
      document.removeEventListener('selectionchange', selectionChanged);
    };
  }, [options.view, options.path, options.enabled, close]);
  return { menu, close, changed };
}
