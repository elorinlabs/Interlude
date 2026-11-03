import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { useTreeGesture } from './useTreeGesture';

export interface GutterMenuPosition { x: number; y: number; touch?: boolean }

const inGutter = (target: EventTarget) => target instanceof Element && !!target.closest('.cm-gutters');

/** Share the file tree's long-press threshold and scrolling/click suppression behavior. */
export function useGutterMenu(view: MutableRefObject<EditorView | undefined>, enabled: boolean) {
  const [menu, setMenu] = useState<GutterMenuPosition>();
  const touch = useRef(false);
  const close = useCallback(() => setMenu(undefined), []);
  const gesture = useTreeGesture(position => setMenu({ ...position, touch: touch.current }));
  useEffect(() => {
    const editor = view.current;
    if (!editor || !enabled) return;
    const scrolled = () => { gesture.onPointerCancel(); close(); };
    editor.scrollDOM.addEventListener('scroll', scrolled);
    return () => editor.scrollDOM.removeEventListener('scroll', scrolled);
  }, [enabled, close, view]);
  return { menu, close, handlers: enabled ? {
    onContextMenuCapture: (event: React.MouseEvent) => {
      if (inGutter(event.target)) gesture.onContextMenu(event);
    },
    onPointerDownCapture: (event: React.PointerEvent) => {
      touch.current = event.pointerType === 'touch';
      gesture.onPointerDown(event);
      // Script buttons keep their own touch action; a gutter press must never launch a script.
      if (!inGutter(event.target) || (event.target instanceof Element && event.target.closest('button'))) {
        gesture.onPointerCancel(); return;
      }
    },
    onPointerMoveCapture: gesture.onPointerMove,
    onPointerUpCapture: gesture.onPointerUp,
    onPointerCancelCapture: gesture.onPointerCancel,
    onClickCapture: gesture.onClickCapture,
  } : undefined };
}
