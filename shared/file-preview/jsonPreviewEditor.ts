import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const jsonPreviewHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.propertyName, class: 'json-token-property' },
  { tag: tags.string, class: 'json-token-string' },
  { tag: tags.number, class: 'json-token-number' },
  { tag: [tags.bool, tags.null], class: 'json-token-literal' },
  { tag: tags.comment, class: 'json-token-comment' },
]));

export function createJsonPreview(options: {
  parent: HTMLElement; text: string; label: string; extensions: Extension;
}): EditorView {
  // Default splitting accepts mixed line endings; a fixed separator merges otherwise valid lines.
  return new EditorView({ parent: options.parent, state: EditorState.create({ doc: options.text, extensions: [
    EditorState.readOnly.of(true), EditorView.editable.of(false), lineNumbers(),
    highlightActiveLine(), highlightActiveLineGutter(), keymap.of(defaultKeymap),
    EditorView.contentAttributes.of({ 'aria-label': options.label, 'aria-readonly': 'true', tabindex: '0' }),
    options.extensions,
  ] }) });
}
