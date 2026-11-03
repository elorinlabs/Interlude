import { common, createLowlight } from 'lowlight';
import type { RootContent } from 'hast';

const highlighter = createLowlight(common);
const MAX_HIGHLIGHT_CHARACTERS = 30_000;
const MAX_HIGHLIGHT_SPANS = 2_000;
const FILE_LANGUAGES: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  rs: 'rust', py: 'python', json: 'json', css: 'css', less: 'less', scss: 'scss', html: 'xml', svg: 'xml',
  xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'ini', sh: 'bash', ps1: 'powershell', sql: 'sql',
  c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', go: 'go', java: 'java', md: 'markdown', diff: 'diff',
};
// These are the same light-theme token colors used by the desktop Codex GUI.
const TOKEN_COLORS: Record<string, string> = {
  'hljs-keyword': '#8950ab', 'hljs-selector-tag': '#8950ab', 'hljs-literal': '#8950ab',
  'hljs-string': '#217745', 'hljs-regexp': '#217745', 'hljs-addition': '#217745',
  'hljs-number': '#a45817', 'hljs-attr': '#a45817', 'hljs-symbol': '#a45817',
  'hljs-title': '#2368af', 'hljs-built_in': '#2368af', 'hljs-type': '#2368af',
  'hljs-comment': '#78817e', 'hljs-quote': '#78817e', 'hljs-meta': '#78817e', 'hljs-deletion': '#c24047',
};
export interface CodeSpan { text: string; color?: string }

export function fileLanguage(path: string): string {
  return FILE_LANGUAGES[path.split('.').pop()?.toLowerCase() ?? ''] ?? '';
}

function appendSpan(spans: CodeSpan[], span: CodeSpan) {
  const previous = spans[spans.length - 1];
  if (previous && previous.color === span.color) previous.text += span.text;
  else spans.push(span);
}

function collectSpans(nodes: RootContent[], spans: CodeSpan[], inheritedColor?: string) {
  for (const node of nodes) {
    if (node.type === 'text') appendSpan(spans, { text: node.value, color: inheritedColor });
    if (node.type !== 'element') continue;
    const classes = node.properties.className;
    const color = Array.isArray(classes)
      ? classes.map((name) => TOKEN_COLORS[String(name)]).find(Boolean) : undefined;
    collectSpans(node.children, spans, color ?? inheritedColor);
  }
}

/** Bound native text spans for large generated files while preserving every character. */
export function highlightCode(text: string, language: string): CodeSpan[] {
  if (!language || text.length > MAX_HIGHLIGHT_CHARACTERS || !highlighter.registered(language)) return [{ text }];
  const spans: CodeSpan[] = [];
  collectSpans(highlighter.highlight(language, text).children, spans);
  return spans.length > MAX_HIGHLIGHT_SPANS ? [{ text }] : spans;
}
