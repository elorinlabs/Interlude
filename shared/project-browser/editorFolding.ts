import type { Extension } from '@codemirror/state';
import { lineNumbers, type BlockInfo, type EditorView } from '@codemirror/view';
import { foldable, foldedRanges, foldEffect, foldGutter, unfoldEffect } from '@codemirror/language';
import type { BrowserTranslate } from './ProjectTree';

function toggleLineFold(view: EditorView, line: BlockInfo) {
  let folded: { from: number; to: number } | undefined;
  foldedRanges(view.state).between(line.from, line.to, (from, to) => {
    if (!folded || from < folded.from) folded = { from, to };
  });
  if (folded) {
    view.dispatch({ effects: unfoldEffect.of(folded) });
    return true;
  }
  const range = foldable(view.state, line.from, line.to);
  if (!range) return false;
  view.dispatch({ effects: foldEffect.of(range) });
  return true;
}

function foldMarker(open: boolean, t: BrowserTranslate) {
  const marker = document.createElement('span');
  marker.title = t(open ? "client.projectBrowser.foldLine" : "client.projectBrowser.unfoldLine");
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6');
  svg.append(path);
  marker.append(svg);
  return marker;
}

/** The number cell and arrow both toggle the same visible line, including wrapped lines. */
export function editorFolding(t: BrowserTranslate): Extension {
  return [
    lineNumbers({ domEventHandlers: { click: toggleLineFold } }),
    foldGutter({ markerDOM: open => foldMarker(open, t) }),
  ];
}
