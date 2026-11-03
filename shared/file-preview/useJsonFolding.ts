import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { foldAll, forceParsing, unfoldAll } from '@codemirror/language';

const PARSE_SLICE_MS = 8;

/** Complete large document structure in short slices before folding beyond the visible viewport. */
export function useJsonFolding({ view, text, plain, label }: {
  view: MutableRefObject<EditorView | undefined>; text: string; plain: boolean; label: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [busy, setBusy] = useState(false);
  const cancel = () => { clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => { setBusy(false); return cancel; }, [text, plain, label]);
  const fold = () => {
    cancel();
    const editor = view.current;
    if (!editor || plain) return;
    setBusy(true);
    const parse = () => {
      if (view.current !== editor) return;
      if (!forceParsing(editor, editor.state.doc.length, PARSE_SLICE_MS)) {
        timer.current = setTimeout(parse, 0);
        return;
      }
      foldAll(editor);
      timer.current = undefined;
      setBusy(false);
    };
    timer.current = setTimeout(parse, 0);
  };
  const unfold = () => {
    cancel(); setBusy(false);
    if (view.current) unfoldAll(view.current);
  };
  return { fold, unfold, busy };
}
