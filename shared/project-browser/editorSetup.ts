import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { foldService, HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { tags } from '@lezer/highlight';
import type { BrowserTranslate } from './ProjectTree';

const PLAIN_TEXT = /\.(txt|log|csv|tsv|md|markdown|rst)$/i;

/** Determine syntax from the filename only; prose must never be auto-detected as code. */
export function editorLanguage(path: string) {
  if (PLAIN_TEXT.test(path)) return null;
  return LanguageDescription.matchFilename(languages, path.split(/[\\/]/).at(-1) ?? '') ?? null;
}

/** Text without a grammar can still fold paragraphs and indented sections. */
export const textFolding = foldService.of((state, from, to) => {
  const line = state.doc.lineAt(from);
  if (!line.text.trim()) return null;
  const indentation = line.text.search(/\S/);
  let end = to;
  for (let number = line.number + 1; number <= state.doc.lines; number += 1) {
    const next = state.doc.line(number);
    if (!next.text.trim() || (indentation > 0 && next.text.search(/\S/) < indentation)) break;
    end = next.to;
  }
  return end > to ? { from: to, to: end } : null;
});

export const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--pf-ink)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, "SFMono-Regular", monospace', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--pf-ink)', padding: '12px 0' },
  '.cm-gutters': { backgroundColor: 'var(--pf-subtle)', color: 'var(--pf-muted)',
    borderRight: '1px solid var(--pf-border)', userSelect: 'none', WebkitUserSelect: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { cursor: 'pointer' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0', cursor: 'pointer' },
  // Use the first visual line's height so wrapping never moves the arrow below its line number.
  '.cm-foldGutter span': { display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '16px', height: '1.6em', padding: '0', verticalAlign: 'top' },
  '.cm-foldGutter svg': { display: 'block' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--pf-hover)' },
  '.cm-panels': { color: 'var(--pf-ink)', backgroundColor: 'var(--pf-surface)', borderColor: 'var(--pf-border)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--pf-ink)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--pf-selection)' },
  // Match CodeMirror's focused layer selector so its light default cannot override the host palette.
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--pf-selection)',
  },
  '.cm-tooltip': { backgroundColor: 'var(--pf-surface)', color: 'var(--pf-ink)' },
});

export const editorHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--pf-code-keyword)' },
  { tag: [tags.string, tags.regexp], color: 'var(--pf-code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--pf-code-number)' },
  { tag: [tags.function(tags.variableName), tags.typeName, tags.className], color: 'var(--pf-code-function)' },
  { tag: [tags.comment, tags.meta], color: 'var(--pf-muted)', fontStyle: 'italic' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--pf-code-property)' },
  { tag: tags.invalid, textDecoration: 'underline wavy #d14343' },
]));

export function editorPhrases(t: BrowserTranslate): Extension {
  const labels: Record<string, string> = {
    Find: "client.projectBrowser.find", Replace: "client.projectBrowser.replace", next: "client.projectBrowser.next", previous: "client.projectBrowser.previous", all: "client.configHelp.all",
    'match case': "client.projectBrowser.matchCase", regexp: "client.projectBrowser.regularExpression", 'by word': "client.projectBrowser.wholeWords",
    replace: "client.projectBrowser.replace", 'replace all': "client.projectBrowser.replaceAll", close: "client.projectBrowser.close",
    'Fold line': "client.projectBrowser.foldLine", 'Unfold line': "client.projectBrowser.unfoldLine", 'Go to line': "client.projectBrowser.goToLine", go: "client.projectBrowser.go",
    'current match': "client.projectBrowser.currentMatch", 'replaced $ matches': "client.projectBrowser.replacedMatches",
  };
  return EditorState.phrases.of(Object.fromEntries(Object.entries(labels).map(([key, value]) => [key, t(value)])));
}
