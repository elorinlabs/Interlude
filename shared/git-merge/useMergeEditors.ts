import { useLayoutEffect, useRef, useState } from 'react';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView, drawSelection, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory, redo, undo } from '@codemirror/commands';
import { editorHighlighting, editorLanguage } from '../project-browser/editorSetup';
import type { MergeDocument, MergeModel } from './model';
import { mergeArrows, mergeHighlight, mergeHistory, mergeRanges, setMergeRanges } from './editorState';

type Side = 'left' | 'result' | 'right';
interface Options {
  model: MergeModel; path: string; disabled: boolean;
  missing: ('left' | 'right')[];
  label: (side: Side) => string; arrowLabel: (side: 'left' | 'right', id: number) => string;
  onChange: (text: string, remaining: number) => void;
}
const paneTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12px', backgroundColor: 'var(--git-surface)', color: 'var(--git-ink)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, "SFMono-Regular", monospace', lineHeight: '22px' },
  '.cm-content': { padding: '8px 0', minHeight: '100%' },
  '.cm-gutters': { backgroundColor: 'var(--git-subtle)', color: 'var(--git-muted)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-cursor': { borderLeftColor: 'var(--git-ink)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--git-accent-bg)' },
  // Match CodeMirror's focused layer selector so its light default cannot override the host palette.
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--git-accent-bg)',
  },
});

function createPane(options: {
  parent: HTMLElement; doc: MergeDocument; side: Side; settings: Options;
  choose: (id: number, side: 'left' | 'right') => void; editable: Compartment;
  select: (id: number) => void;
}) {
  const { side, doc, settings, editable } = options;
  const language = new Compartment();
  const controls = new Compartment();
  const attributes = new Compartment();
  const arrows = (settings: Options) => side === 'result' || settings.missing.includes(side) ? []
    : mergeArrows({ side, label: id => settings.arrowLabel(side, id), disabled: settings.disabled,
      apply: id => options.choose(id, side) });
  const labels = (settings: Options) => EditorView.contentAttributes.of({
    'aria-label': settings.label(side), spellcheck: 'false',
  });
  const view = new EditorView({ parent: options.parent, state: EditorState.create({
    doc: doc.text, extensions: [paneTheme, drawSelection(), lineNumbers(),
      editorHighlighting, language.of([]),
      mergeRanges.init(() => doc.ranges), mergeHighlight,
      attributes.of(labels(settings)), controls.of(arrows(settings)),
      editable.of([EditorState.readOnly.of(side !== 'result' || settings.disabled),
        EditorView.editable.of(side === 'result' && !settings.disabled)]),
      side === 'result' ? [history(), mergeHistory, keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of(update => {
          if (update.selectionSet) {
            const cursor = update.state.selection.main.head;
            const range = update.state.field(mergeRanges).find(range => cursor >= range.from && cursor <= range.to);
            if (range) options.select(range.id);
          }
          if (update.docChanged || update.transactions.some(transaction => transaction.effects.length)) {
            settings.onChange(update.state.doc.toString(), update.state.field(mergeRanges)
              .filter(range => !range.resolved).length);
          }
        })] : [],
    ],
  }) });
  // CodeMirror hides gutters by default; our gutter contains keyboard-operable merge controls.
  view.dom.querySelectorAll('.cm-gutters').forEach(element => element.removeAttribute('aria-hidden'));
  let alive = true;
  // Grammar loading is optional; the text and merge actions stay usable when a language chunk is unavailable.
  void editorLanguage(settings.path)?.load().then(support => {
    if (alive) view.dispatch({ effects: language.reconfigure(support) });
  }).catch(() => undefined);
  return { view, dispose: () => { alive = false; view.destroy(); },
    updateLabels: (settings: Options) => view.dispatch({ effects: [
      attributes.reconfigure(labels(settings)), controls.reconfigure(arrows(settings)),
    ] }) };
}

export function useMergeEditors(options: Options) {
  const left = useRef<HTMLDivElement>(null); const result = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const views = useRef<Partial<Record<Side, EditorView>>>({});
  const editable = useRef(new Compartment());
  const panesRef = useRef<ReturnType<typeof createPane>[]>([]);
  const latest = useRef(options); latest.current = options;
  const [active, setActive] = useState(0);
  const focus = (id: number) => {
    setActive(id);
    for (const view of Object.values(views.current)) {
      const range = view.state.field(mergeRanges).find(range => range.id === id);
      if (range) view.dispatch({ effects: EditorView.scrollIntoView(range.from, { y: 'center' }) });
    }
  };
  const choose = (id: number, side: 'left' | 'right' | 'both' | 'manual') => {
    const view = views.current.result;
    if (!view || latest.current.disabled) return;
    const ranges = view.state.field(mergeRanges);
    const target = ranges.find(range => range.id === id);
    const block = latest.current.model.blocks[id];
    if (!target || !block) return;
    const insert = side === 'manual' ? view.state.sliceDoc(target.from, target.to)
      : side === 'both' ? block.left + block.right : block[side];
    const changes = view.state.changes({ from: target.from, to: target.to, insert });
    const next = ranges.map(range => range.id === id
      ? { ...range, to: range.from + insert.length, resolved: true }
      : { ...range, from: changes.mapPos(range.from, range.id < id ? -1 : 1),
        to: changes.mapPos(range.to, range.id < id ? -1 : 1) });
    view.dispatch({ changes, effects: setMergeRanges.of(next),
      annotations: [Transaction.userEvent.of('input.merge'), isolateHistory.of('full')] });
    focus(id);
  };
  useLayoutEffect(() => {
    const panes = (['left', 'result', 'right'] as const).map(side => createPane({
      parent: { left, result, right }[side].current!, doc: options.model[side], side,
      settings: { ...options, onChange: (...args) => latest.current.onChange(...args) },
      choose, select: setActive, editable: side === 'result' ? editable.current : new Compartment(),
    }));
    views.current = { left: panes[0].view, result: panes[1].view, right: panes[2].view };
    panesRef.current = panes;
    const stops = synchronizeScroll(panes.map(pane => pane.view));
    return () => { stops(); panes.forEach(pane => pane.dispose()); views.current = {}; };
    // The parent remounts this hook for a different snapshot. Keystrokes preserve editor history.
  }, []);
  useLayoutEffect(() => {
    views.current.result?.dispatch({ effects: editable.current.reconfigure([
      EditorState.readOnly.of(options.disabled), EditorView.editable.of(!options.disabled),
    ]) });
  }, [options.disabled]);
  const labels = [options.label('left'), options.label('result'), options.label('right')];
  useLayoutEffect(() => {
    panesRef.current.forEach(pane => pane.updateLabels(latest.current));
  }, [labels[0], labels[1], labels[2], options.disabled]);
  const command = (action: typeof undo) => { if (views.current.result) action(views.current.result); };
  return { left, right, result, active, focus, choose,
    undo: () => command(undo), redo: () => command(redo) };
}

function synchronizeScroll(views: EditorView[]) {
  let owner: HTMLElement | null = null;
  let frame = 0;
  const handlers = views.map(view => {
    const element = view.scrollDOM;
    const handler = () => {
      if (owner && owner !== element) return;
      owner = element;
      const ratio = element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight);
      for (const other of views) {
        if (other !== view) other.scrollDOM.scrollTop = ratio * (other.scrollDOM.scrollHeight - other.scrollDOM.clientHeight);
      }
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { owner = null; });
    };
    element.addEventListener('scroll', handler);
    return () => element.removeEventListener('scroll', handler);
  });
  return () => { cancelAnimationFrame(frame); handlers.forEach(stop => stop()); };
}
