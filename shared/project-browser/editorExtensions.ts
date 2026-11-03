import { EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, keymap, rectangularSelection, lineNumbers,
} from '@codemirror/view';
import {
  bracketMatching, defaultHighlightStyle, foldKeymap, indentOnInput, syntaxHighlighting,
} from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { editorFolding } from './editorFolding';
import type { BrowserTranslate } from './ProjectTree';

/** Keep the basic editor features while configuring our own fold gutter. */
export function editorExtensions(t: BrowserTranslate, plainText = false): Extension {
  if (plainText) return [lineNumbers(), history(), drawSelection(), dropCursor(), highlightActiveLine(),
    highlightActiveLineGutter(), EditorState.allowMultipleSelections.of(true),
    keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap])];
  return [
    editorFolding(t),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap,
      ...foldKeymap, ...completionKeymap, ...lintKeymap,
    ]),
  ];
}
