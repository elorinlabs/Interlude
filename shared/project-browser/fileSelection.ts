import type { EditorState } from '@codemirror/state';
import { MAX_QUOTE_CHARACTERS, type ReplyQuote } from '../../apps/desktop/src/pages/codexGui/replyQuotes';

export interface FilePosition { line: number; column: number }
export interface FileSelection { path: string; start: FilePosition; end: FilePosition; text: string }

/** Positions are one-based, with an exclusive end, matching the editor's selection. */
export function selectedFileText(state: EditorState, path: string): FileSelection | null {
  const { from, to, empty } = state.selection.main;
  if (empty) return null;
  const position = (offset: number): FilePosition => {
    const line = state.doc.lineAt(offset);
    return { line: line.number, column: offset - line.from + 1 };
  };
  return { path, start: position(from), end: position(to), text: state.sliceDoc(from, to) };
}

export function fileSelectionQuote(selection: FileSelection): ReplyQuote {
  const { path, start, end, text } = selection;
  const location = `${path}:${start.line}:${start.column}-${end.line}:${end.column}`;
  let fenceLength = 3;
  for (const match of text.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1);
  const fence = '`'.repeat(fenceLength);
  return { messageId: `file:${location}`, source: 'file', text: `${location}\n${fence}\n${text}\n${fence}` };
}

export function validFileSelection(value: Record<string, unknown>): value is Record<string, unknown> & FileSelection {
  const position = (entry: unknown): entry is FilePosition => {
    if (!entry || typeof entry !== 'object') return false;
    const { line, column } = entry as FilePosition;
    return Number.isSafeInteger(line) && line > 0 && Number.isSafeInteger(column) && column > 0;
  };
  if (typeof value.path !== 'string' || /[\0\r\n]/.test(value.path)
    || typeof value.text !== 'string' || !value.text.length || value.text.length > MAX_QUOTE_CHARACTERS
    || !position(value.start) || !position(value.end)) return false;
  return value.end.line > value.start.line
    || (value.end.line === value.start.line && value.end.column > value.start.column);
}
