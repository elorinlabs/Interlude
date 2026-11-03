import { useEffect, useRef, useState } from 'react';
import { Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { foldKeymap } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { displayText as t } from '../localization/messages';
import { editorFolding } from '../project-browser/editorFolding';
import { editorPhrases } from '../project-browser/editorSetup';
import { createJsonPreview, jsonPreviewHighlighting } from './jsonPreviewEditor';
import { useJsonFolding } from './useJsonFolding';

export function useJsonPreview({ text, plain, line, label }: {
  text: string; plain: boolean; line?: number; label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>();
  const folding = useJsonFolding({ view, text, plain, label });
  const syntax = useRef(new Compartment());
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    if (!host.current) return;
    const editor = createJsonPreview({ parent: host.current, text, label,
      extensions: [syntax.current.of([]), editorPhrases(t)] });
    view.current = editor;
    return () => { editor.destroy(); view.current = undefined; };
  }, [text, label]);
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    let cancelled = false;
    setStatus('loading');
    editor.dispatch({ effects: syntax.current.reconfigure([]) });
    // Incremental parsing and viewport rendering keep large JSON out of the React token tree.
    if (!plain) void languages.find(language => language.name === 'JSON')?.load().then(support => {
      if (cancelled) return;
      editor.dispatch({ effects: syntax.current.reconfigure([
        support, jsonPreviewHighlighting, editorFolding(t), keymap.of(foldKeymap),
      ]) });
      setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('failed'); });
    return () => { cancelled = true; };
  }, [plain, text, label]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || !line || !Number.isFinite(line)) return;
    const position = editor.state.doc.line(Math.max(1, Math.min(Math.floor(line), editor.state.doc.lines))).from;
    editor.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
  }, [line, text, label]);
  return { host, status, ...folding };
}
