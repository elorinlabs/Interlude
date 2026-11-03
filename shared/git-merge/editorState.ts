import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, gutter } from '@codemirror/view';
import { invertedEffects } from '@codemirror/commands';
import type { MergeRange } from './model';

export const setMergeRanges = StateEffect.define<MergeRange[]>();
export const mergeRanges = StateField.define<MergeRange[]>({
  create: () => [],
  update: (ranges, transaction) => {
    const effect = transaction.effects.find(effect => effect.is(setMergeRanges));
    if (effect) return effect.value;
    if (!transaction.docChanged) return ranges;
    return ranges.map(range => {
      const from = transaction.changes.mapPos(range.from, -1);
      const to = transaction.changes.mapPos(range.to, 1);
      return { ...range, from, to: Math.max(from, to) };
    });
  },
});

// Resolution flags and positions belong to undo history together with the edited text.
export const mergeHistory = invertedEffects.of(transaction =>
  transaction.docChanged || transaction.effects.some(effect => effect.is(setMergeRanges))
    ? [setMergeRanges.of(transaction.startState.field(mergeRanges))] : []);

export const mergeHighlight = EditorView.decorations.compute([mergeRanges, 'doc'], state => {
  const lines = new Map<number, boolean>();
  for (const range of state.field(mergeRanges)) {
    const start = state.doc.lineAt(range.from).number;
    const end = state.doc.lineAt(Math.max(range.from, range.to - 1)).number;
    for (let number = start; number <= end; number += 1) {
      const pos = state.doc.line(number).from;
      lines.set(pos, (lines.get(pos) ?? true) && range.resolved);
    }
  }
  return Decoration.set([...lines].sort(([a], [b]) => a - b).map(([pos, resolved]) =>
    Decoration.line({ class: resolved ? 'gm-resolved-line' : 'gm-conflict-line' }).range(pos)));
});

class MergeArrow extends GutterMarker {
  constructor(readonly id: number, readonly side: 'left' | 'right', readonly label: string,
    readonly action: { apply: (id: number) => void; disabled: boolean }) { super(); }
  eq(other: MergeArrow) {
    return this.id === other.id && this.label === other.label && this.action.disabled === other.action.disabled;
  }
  toDOM() {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'gm-arrow';
    button.textContent = this.side === 'left' ? '→' : '←';
    button.setAttribute('aria-label', this.label);
    button.disabled = this.action.disabled;
    button.addEventListener('click', () => this.action.apply(this.id));
    return button;
  }
}

export function mergeArrows(options: {
  side: 'left' | 'right'; label: (id: number) => string; apply: (id: number) => void; disabled: boolean;
}) {
  return gutter({ class: 'gm-arrow-gutter', side: options.side === 'left' ? 'after' : 'before',
    lineMarker: (view, line) => {
      const range = view.state.field(mergeRanges).find(range =>
        view.state.doc.lineAt(range.from).from === line.from);
      return range ? new MergeArrow(range.id, options.side, options.label(range.id), options) : null;
    },
    lineMarkerChange: update => update.transactions.some(transaction => transaction.effects.length > 0),
  });
}
