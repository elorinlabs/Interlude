export const MEBIBYTE = 1024 * 1024;
export const DEFAULT_JSON_HIGHLIGHT_MB = 10;
export const MIN_JSON_HIGHLIGHT_MB = 1;
// Matches the bounded JSON reader in codex_gui/file_preview/content.rs.
export const MAX_JSON_HIGHLIGHT_MB = 100;

export function jsonHighlightLimit(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= MIN_JSON_HIGHLIGHT_MB && value <= MAX_JSON_HIGHLIGHT_MB ? value : DEFAULT_JSON_HIGHLIGHT_MB;
}

export function isJsonPath(path: string): boolean {
  return /\.(json|jsonc|json5|geojson|ipynb)$/i.test(path);
}

/** Older peers omit the original size; UTF-8 is the fallback, never JavaScript string length. */
export function previewByteLength(text: string, size?: number): number {
  return size !== undefined && Number.isSafeInteger(size) && size >= 0 ? size : new TextEncoder().encode(text).length;
}
