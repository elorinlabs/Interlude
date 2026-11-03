export const TOOL_OUTPUT_PAGE_CHARACTERS = 8_000;
export interface ToolOutputText { text: string; markdown: boolean }

/** Desktop treats only structured text parts as Markdown; raw tool strings must remain literal. */
export function toolOutputText(value: unknown): ToolOutputText | undefined {
  if (typeof value === 'string') return { text: value, markdown: false };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const text = (value as Record<string, unknown>).text;
  return typeof text === 'string' ? { text, markdown: true } : undefined;
}

function textBoundary(text: string, index: number): number {
  // Keep a UTF-16 surrogate pair on the same page so its character stays readable in native Text.
  return /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text.slice(index - 1, index + 1)) ? index - 1 : index;
}

/** Bound parsing and native layout before rendering, including a single enormous paragraph. */
export function toolOutputPage(text: string, requestedPage: number) {
  const pages = Math.max(1, Math.ceil(text.length / TOOL_OUTPUT_PAGE_CHARACTERS));
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  const start = textBoundary(text, page * TOOL_OUTPUT_PAGE_CHARACTERS);
  const end = textBoundary(text, Math.min(text.length, (page + 1) * TOOL_OUTPUT_PAGE_CHARACTERS));
  return { page, pages, visible: text.slice(start, end) };
}
